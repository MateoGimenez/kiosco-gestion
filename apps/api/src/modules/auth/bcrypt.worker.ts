// Hilo aparte para bcrypt (ADR 004). Autocontenido: solo importa `bcryptjs` y `node:worker_threads`,
// y usa únicamente sintaxis de TypeScript que Node 24 ejecuta sin compilar (solo tipos), así corre
// igual con tsx (desarrollo), Vitest (tests) y el build (tsdown lo compila como una entrada más).
// Adentro se usan las funciones SINCRÓNICAS de bcryptjs: en su propio hilo no molestan a nadie.
// NUNCA se loguea ni se devuelve el contenido de los mensajes (traen contraseñas).
import { parentPort } from 'node:worker_threads';
import bcrypt from 'bcryptjs';

type Request =
  | { id: number; op: 'hash'; password: string; cost: number }
  | { id: number; op: 'compare'; password: string; hash: string };

type Response = { id: number; ok: true; result: string | boolean } | { id: number; ok: false };

if (!parentPort) throw new Error('bcrypt.worker solo corre como worker_thread.');
const port = parentPort;

port.on('message', (msg: Request) => {
  let response: Response;
  try {
    response =
      msg.op === 'hash'
        ? { id: msg.id, ok: true, result: bcrypt.hashSync(msg.password, msg.cost) }
        : { id: msg.id, ok: true, result: bcrypt.compareSync(msg.password, msg.hash) };
  } catch {
    // Sin detalles: el error podría incluir datos de la contraseña o del hash.
    response = { id: msg.id, ok: false };
  }
  port.postMessage(response);
});
