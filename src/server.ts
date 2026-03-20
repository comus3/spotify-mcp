import express from 'express';
import morgan from 'morgan';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { config } from './config.js';
import { SpotifyClient } from './spotifyClient.js';
import { createMcpServer } from './mcpServer.js';

const app = express();
const spotify = new SpotifyClient();

app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

// ── Optional MCP secret middleware ─────────────────────────────────────────
function mcpAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!config.mcpSecret) return next();
  const provided =
    req.headers['x-mcp-secret'] ??
    req.query['secret'];
  if (provided !== config.mcpSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// ── Auth routes ────────────────────────────────────────────────────────────
app.get('/auth/login', async (_req, res) => {
  try {
    const loginUrl = await spotify.createLoginUrl();
    res.redirect(loginUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Login error: ${msg}`);
  }
});

app.get('/auth/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) {
    res.redirect(`/?error=${encodeURIComponent(error)}`);
    return;
  }
  if (!code || !state) {
    res.redirect('/?error=missing_params');
    return;
  }
  try {
    await spotify.handleCallback(code, state);
    res.redirect('/?success=1');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.redirect(`/?error=${encodeURIComponent(msg)}`);
  }
});

app.get('/auth/status', (_req, res) => {
  res.json({ authenticated: spotify.isAuthenticated() });
});

app.post('/auth/logout', (_req, res) => {
  spotify.logout();
  res.json({ ok: true });
});

// ── MCP Streamable HTTP transport ──────────────────────────────────────────
const sessions = new Map<string, { server: Server; transport: StreamableHTTPServerTransport }>();

app.post('/mcp', mcpAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    const { transport } = sessions.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, { server: mcpServer, transport });
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };

  const mcpServer = createMcpServer(spotify);
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', mcpAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }
  const { transport } = sessions.get(sessionId)!;
  await transport.handleRequest(req, res);
});

app.delete('/mcp', mcpAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (sessionId && sessions.has(sessionId)) {
    const { server, transport } = sessions.get(sessionId)!;
    await server.close();
    sessions.delete(sessionId);
  }
  res.status(200).end();
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`Spotify MCP server running on port ${config.port}`);
  console.log(`MCP endpoint: http://localhost:${config.port}/mcp`);
  console.log(`Authenticated: ${spotify.isAuthenticated()}`);
});
