import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function indexRoute(fastify) {
  fastify.get('/', async function handler() {
    return { message: 'Welcome to the Biothon backend' };
  });
}
