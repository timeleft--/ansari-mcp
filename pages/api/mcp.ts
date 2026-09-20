import type { NextApiRequest, NextApiResponse } from 'next'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { z } from 'zod'
import { askAnsari, DEFAULT_ANSARI_API_URL } from '@/ansari-service'

// One definition serves modern requests and the stateless legacy fallback.
const mcp = createMcpHandler(() => {
  const server = new McpServer({ name: 'Ansari', version: '1.0.0' }, {
    capabilities: { resources: {}, prompts: {}, logging: {} },
  })
  // SDK 2 supplies empty discovery for declared capabilities and handles
  // logging/setLevel for legacy clients. Content and headers are never logged.
  server.registerTool('answer_islamic_question', {
    description: 'Answer questions about Islamic theology, history, and practice based on authentic sources',
    inputSchema: z.object({
      question: z.string().describe('The question about Islam to be answered'),
    }).strict(),
  }, async ({ question }) => ({
    content: [{ type: 'text', text: await askAnsari(question, DEFAULT_ANSARI_API_URL) }],
  }))
  return server
}, { legacy: 'stateless', responseMode: 'json', maxSubscriptions: 0 })
const serveMcp = toNodeHandler(mcp)

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Requested-With, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  // No standalone event stream or session is offered. The SDK may use
  // a bounded SSE response for legacy POST requests.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    res.status(405).end()
    return
  }

  await serveMcp(req, res, req.body)
}
