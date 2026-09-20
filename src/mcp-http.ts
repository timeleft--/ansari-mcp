import type { NextApiRequest, NextApiResponse } from 'next';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { answerTool } from './answer-tool.js';
import { DEFAULT_ANSARI_API_URL, type AnswerProfile } from './ansari-service.js';

export function createMcpHandler(profile: AnswerProfile) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Non-browser MCP clients need no Origin header. Browser origins must be
    // explicitly allowed; never reflect arbitrary Origin or forwarded headers.
    const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS ?? 'https://mcp.ansari.chat,http://localhost:3000,http://127.0.0.1:3000')
      .split(',').map(origin => origin.trim()).filter(Boolean);
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    // This stateless server has no server-initiated stream or session to delete.
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      res.status(405).end();
      return;
    }
    const server = new McpServer({ name: profile === 'alexa' ? 'Ansari Voice' : 'Ansari', version: '1.0.0' });
    const tool = answerTool(profile, process.env.ANSARI_API_URL || DEFAULT_ANSARI_API_URL);
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.parameters,
      annotations: tool.annotations,
    }, tool.execute);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } finally {
      await server.close();
    }
  };
}
