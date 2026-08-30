import { resolve } from 'node:path';
import staticPlugin from '@fastify/static';
import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? '3000');
const host = process.env.HOST ?? '127.0.0.1';
const databasePath = process.env.DATABASE_PATH;
const appOrigin = process.env.APP_ORIGIN;

if (!databasePath || !appOrigin) {
  throw new Error('DATABASE_PATH and APP_ORIGIN are required.');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 through 65535.');
}
const parsedOrigin = new URL(appOrigin);
if (
  parsedOrigin.origin !== appOrigin ||
  (process.env.NODE_ENV === 'production' && parsedOrigin.protocol !== 'https:')
) {
  throw new Error('APP_ORIGIN must be an exact origin and must use HTTPS in production.');
}

const app = await buildApp({ databasePath, allowedOrigins: [appOrigin] });
await app.register(staticPlugin, { root: resolve('dist'), wildcard: false });
app.get('/*', async (_request, reply) => reply.sendFile('index.html'));

const shutdown = async () => {
  await app.close();
  process.exitCode = 0;
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ port, host });
