import type { IncomingMessage, ServerResponse } from 'node:http';
import { handle } from '@hono/node-server/vercel';
import { app } from './index.js';

const listener = handle(app);

// Vercel Node.js runtime pre-parsea req.body consumiendo el stream de entrada.
// @hono/node-server/vercel lee req.rawBody (si es Buffer) o intenta leer el stream de nuevo.
export default function vercelHandler(
  req: IncomingMessage & { body?: unknown; rawBody?: Buffer },
  res: ServerResponse,
) {
  if (req.body !== undefined && !(req.rawBody instanceof Buffer)) {
    req.rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === 'string'
        ? Buffer.from(req.body)
        : Buffer.from(JSON.stringify(req.body));
  }
  return listener(req, res);
}
