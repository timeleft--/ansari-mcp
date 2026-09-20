import type { NextApiRequest, NextApiResponse } from 'next'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ListPromptsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { askAnsari, DEFAULT_ANSARI_API_URL } from '@/ansari-service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Native MCP clients need no Origin. Browser origins are explicitly allowed,
  // rather than trusting the caller's Origin or forwarded host headers.
  const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS ?? 'https://mcp.ansari.chat,http://localhost:3000,http://127.0.0.1:3000')
    .split(',').map(origin => origin.trim()).filter(Boolean)
  const origin = req.headers.origin
  res.setHeader('Vary', 'Origin')
  res.setHeader('Cache-Control', 'no-store')
  if (origin && !allowedOrigins.includes(origin)) {
    res.status(403).json({ error: 'Origin not allowed' })
    return
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Requested-With, MCP-Protocol-Version, Mcp-Session-Id')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  // This endpoint offers JSON responses, with no separate SSE stream or session.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    res.status(405).end()
    return
  }

  const server = new McpServer({ name: 'Ansari', version: '1.0.0' }, {
    capabilities: { resources: {}, prompts: {}, logging: {} },
  })
  // Preserve the previous empty discovery responses for existing clients.
  server.server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }))
  server.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }))
  server.server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }))
  // The SDK handles logging/setLevel; no question, answer, or header logs are emitted.
  server.registerTool('answer_islamic_question', {
    description: 'Answer questions about Islamic theology, history, and practice based on authentic sources',
    inputSchema: z.object({
      question: z.string().describe('The question about Islam to be answered'),
    }).strict(),
  }, async ({ question }) => ({
    content: [{ type: 'text', text: await askAnsari(question, DEFAULT_ANSARI_API_URL) }],
  }))
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } finally {
    await server.close()
  }
}
