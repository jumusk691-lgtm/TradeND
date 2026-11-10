import { defineConfig, loadEnv, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fileURLToPath, URL } from 'node:url';

function localTradingApi() {
  return {
    name: 'local-trading-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/trading', async (request, response) => {
        if (request.method === 'POST') {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of request) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buffer.length;
            if (size > 32_768) {
              response.statusCode = 413;
              response.end(JSON.stringify({ error: 'Request body is too large.' }));
              return;
            }
            chunks.push(buffer);
          }

          try {
            const rawBody = Buffer.concat(chunks).toString('utf8');
            (request as VercelRequest).body = rawBody ? JSON.parse(rawBody) : {};
          } catch {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ error: 'Request body must be valid JSON.' }));
            return;
          }
        }

        try {
          const api = await server.ssrLoadModule('/api/trading.ts') as {
            default: (request: VercelRequest, response: VercelResponse) => Promise<unknown>;
          };
          const vercelResponse = {
            status(statusCode: number) {
              response.statusCode = statusCode;
              return this;
            },
            json(body: unknown) {
              if (!response.headersSent) response.setHeader('Content-Type', 'application/json');
              response.end(JSON.stringify(body));
              return this;
            },
            setHeader(name: string, value: number | string | readonly string[]) {
              response.setHeader(name, value);
              return this;
            },
          } as unknown as VercelResponse;
          await api.default(request as VercelRequest, vercelResponse);
        } catch (error) {
          console.error('Local trading API failed:', error);
          if (!response.headersSent) {
            response.statusCode = 500;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ error: 'Trading request could not be completed.' }));
          }
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    plugins: [react(), localTradingApi()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      include: ['lucide-react'],
    }
  };
});
