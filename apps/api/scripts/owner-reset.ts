// `npm run owner:reset`: crea o resetea al dueño. Se corre SOLO en la consola de la PC del kiosco.
// La contraseña nunca se pide por argumentos de la línea de comandos (quedaría en el historial):
// se escribe oculta; si la entrada no es una terminal (pruebas), se lee de stdin, una línea por pregunta.
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { loadConfig, loadRootEnvFile, ConfigError } from '../src/config';
import { disconnectPrisma, getPrisma } from '../src/db/prisma';
import { runOwnerReset, type Prompter } from '../src/modules/users/owner-reset';

/** Entrada por terminal: la contraseña no se muestra mientras se escribe. */
function createTerminalPrompter(): { io: Prompter; close: () => void } {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const question = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));
  return {
    io: {
      ask: (q) => question(q),
      async askHidden(q) {
        process.stdout.write(q);
        muted = true;
        const answer = await question('');
        muted = false;
        process.stdout.write('\n');
        return answer;
      },
      say: (m) => console.log(m),
    },
    close: () => rl.close(),
  };
}

/** Entrada sin terminal (stdin redirigido): una línea por pregunta. */
async function createPipedPrompter(): Promise<Prompter> {
  const lines: string[] = [];
  for await (const line of createInterface({ input: process.stdin })) lines.push(line);
  const next = (q: string) => {
    process.stdout.write(q + '\n');
    return Promise.resolve(lines.shift() ?? '');
  };
  return { ask: next, askHidden: next, say: (m) => console.log(m) };
}

async function main(): Promise<number> {
  loadRootEnvFile();
  const config = loadConfig(process.env);
  const prisma = getPrisma();

  console.log('Dueño del kiosco: crear o resetear la contraseña (se corre solo en la PC).');
  const terminal = process.stdin.isTTY ? createTerminalPrompter() : null;
  const io = terminal ? terminal.io : await createPipedPrompter();
  try {
    const outcome = await runOwnerReset(prisma, io, config.bcryptCost);
    if (outcome === 'ABORTED') console.error('Se canceló: no se cambió nada.');
    return outcome === 'CREATED' || outcome === 'RESET' ? 0 : 1;
  } finally {
    terminal?.close();
    await disconnectPrisma();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    if (err instanceof ConfigError) console.error(err.message);
    else
      console.error('No se pudo completar la operación.', err instanceof Error ? err.message : '');
    process.exit(1);
  });
