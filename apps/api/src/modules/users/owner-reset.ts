// Lógica de `npm run owner:reset` (USR-04): crea o resetea al dueño desde la consola de la PC.
// No existe como ruta HTTP (ADR 003, punto 6). Audita con channel SCRIPT, sin usuario ni IP.
import { FullNameSchema, PasswordSchema, UsernameSchema } from '@kiosco/shared';
import { writeAudit } from '../../audit';
import type { PrismaClient } from '../../generated/client';
import { hashPassword } from '../auth/password';
import { revokeUserSessions } from '../auth/session';

/** Quien hace las preguntas (la consola real, o un guion en los tests). */
export interface Prompter {
  /** Pregunta con la respuesta visible. */
  ask(question: string): Promise<string>;
  /** Pregunta sin mostrar lo que se escribe (contraseñas). */
  askHidden(question: string): Promise<string>;
  say(message: string): void;
}

export type OwnerResetOutcome = 'CREATED' | 'RESET' | 'NOT_OWNER' | 'ABORTED';

const MAX_TRIES = 3;

async function askValid<T>(
  io: Prompter,
  ask: () => Promise<string>,
  parse: (v: string) => { success: true; data: T } | { success: false; message: string },
): Promise<T | null> {
  for (let i = 0; i < MAX_TRIES; i++) {
    const result = parse(await ask());
    if (result.success) return result.data;
    io.say(`  ${result.message}`);
  }
  return null;
}

function zodParse<T>(schema: {
  safeParse(v: unknown): { success: boolean; data?: T; error?: { issues: { message: string }[] } };
}) {
  return (value: string) => {
    const r = schema.safeParse(value);
    return r.success
      ? { success: true as const, data: r.data as T }
      : { success: false as const, message: r.error?.issues[0]?.message ?? 'Valor inválido.' };
  };
}

/** Pide la contraseña dos veces, hasta que coincidan y sean válidas. */
async function askNewPassword(io: Prompter): Promise<string | null> {
  for (let i = 0; i < MAX_TRIES; i++) {
    const first = await askValid(
      io,
      () => io.askHidden('Contraseña nueva: '),
      zodParse(PasswordSchema),
    );
    if (first === null) return null;
    const second = await io.askHidden('Repetí la contraseña: ');
    if (first === second) return first;
    io.say('  Las contraseñas no coinciden.');
  }
  return null;
}

export async function runOwnerReset(
  prisma: PrismaClient,
  io: Prompter,
  bcryptCost: number,
): Promise<OwnerResetOutcome> {
  const username = await askValid(
    io,
    () => io.ask('Nombre de usuario del dueño: '),
    zodParse(UsernameSchema),
  );
  if (username === null) return 'ABORTED';

  const existing = await prisma.user.findUnique({ where: { username } });

  if (existing && existing.role !== 'OWNER') {
    io.say(
      `El usuario "${username}" existe pero no es dueño (es ${existing.role}). No se cambió nada: ` +
        'este comando no sube a nadie de rol. Elegí otro nombre o cambiá el rol desde la aplicación.',
    );
    return 'NOT_OWNER';
  }

  if (!existing) {
    const fullName = await askValid(
      io,
      () => io.ask('Nombre completo: '),
      zodParse(FullNameSchema),
    );
    if (fullName === null) return 'ABORTED';
    const password = await askNewPassword(io);
    if (password === null) return 'ABORTED';
    const passwordHash = await hashPassword(password, bcryptCost);
    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { username, fullName, role: 'OWNER', passwordHash },
        });
        await writeAudit(tx, {
          action: 'USER_CREATE',
          entityType: 'User',
          entityId: user.id,
          details: { after: { username, fullName, role: 'OWNER', isActive: true } },
          channel: 'SCRIPT',
        });
      });
    } catch (err) {
      // P2002: alguien creó el mismo usuario justo entre la consulta y la creación.
      if ((err as { code?: unknown } | null)?.code === 'P2002') {
        io.say(
          `Ya existe un usuario llamado "${username}" (se creó mientras tanto). No se cambió nada: volvé a correr el comando.`,
        );
        return 'ABORTED';
      }
      throw err;
    }
    io.say(`Listo: se creó el dueño "${username}".`);
    return 'CREATED';
  }

  const password = await askNewPassword(io);
  if (password === null) return 'ABORTED';
  const passwordHash = await hashPassword(password, bcryptCost);
  await prisma.$transaction(async (tx) => {
    // tokenVersion + 1 corta todas sus sesiones abiertas; si estaba desactivado, se reactiva.
    await tx.user.update({
      where: { id: existing.id },
      data: { passwordHash, tokenVersion: { increment: 1 }, isActive: true },
    });
    await revokeUserSessions(tx, existing.id);
    await writeAudit(tx, {
      action: 'PASSWORD_RESET',
      entityType: 'User',
      entityId: existing.id,
      details: {},
      channel: 'SCRIPT',
    });
    if (!existing.isActive) {
      await writeAudit(tx, {
        action: 'USER_UPDATE',
        entityType: 'User',
        entityId: existing.id,
        details: { before: { isActive: false }, after: { isActive: true } },
        channel: 'SCRIPT',
      });
    }
  });
  io.say(
    `Listo: se cambió la contraseña de "${username}"` +
      (existing.isActive ? '.' : ' y se reactivó el usuario.') +
      ' Sus sesiones abiertas se cerraron.',
  );
  return 'RESET';
}
