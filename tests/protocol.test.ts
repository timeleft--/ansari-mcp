import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import handler from '../pages/api/mcp'

const requests: { url: string | undefined; data: string }[] = []
const answer = `${'A complete answer with qualifications. '.repeat(100)}Original attribution.`
const oldAdapter = axios.defaults.adapter
const oldOrigins = process.env.MCP_ALLOWED_ORIGINS
const http = createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  const nextReq = Object.assign(req, { body: body ? JSON.parse(body) : undefined })
  const nextRes = Object.assign(res, {
    status(code: number) { res.statusCode = code; return nextRes },
    json(data: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return nextRes },
  })
  await handler(nextReq as NextApiRequest, nextRes as ServerResponse as NextApiResponse)
})
let base: string
const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
before(async () => {
  // Control only the downstream HTTP response; exercise the public MCP contract.
  axios.defaults.adapter = async config => {
    requests.push({ url: config.url, data: config.data })
    return { data: answer, status: 200, statusText: 'OK', headers: {}, config }
  }
  process.env.MCP_ALLOWED_ORIGINS = 'https://mcp.ansari.chat,http://localhost:3000'
  http.listen(0, '127.0.0.1')
  await once(http, 'listening')
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`
})
after(() => {
  http.closeAllConnections()
  http.close()
  axios.defaults.adapter = oldAdapter
  if (oldOrigins === undefined) delete process.env.MCP_ALLOWED_ORIGINS
  else process.env.MCP_ALLOWED_ORIGINS = oldOrigins
})
const post = (body: unknown, extra = {}) => fetch(base, {
  method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body),
})

test('negotiates supported revisions and returns a supported fallback for an unknown revision', async () => {
  for (const version of ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2099-01-01']) {
    const response = await post({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {
      protocolVersion: version, capabilities: {}, clientInfo: { name: 'test', version: '1' },
    } })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type')!, /application\/json/)
    assert.equal(response.headers.get('mcp-session-id'), null)
    const message = await response.json()
    assert.equal(message.id, 0)
    assert.equal(message.result.protocolVersion, version === '2099-01-01' ? '2025-11-25' : version)
    for (const capability of ['tools', 'resources', 'prompts', 'logging']) {
      assert.ok(message.result.capabilities[capability])
    }
  }
})

test('SDK client discovers and calls the original tool without rewriting or shortening content', async () => {
  const client = new Client({ name: 'test', version: '1' })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(base)))
    const { tools } = await client.listTools()
    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'answer_islamic_question')
    assert.deepEqual(tools[0].inputSchema.required, ['question'])
    assert.equal(tools[0].inputSchema.additionalProperties, false)
    const question = '  Give a detailed explanation, with citations.  '
    const result = await client.callTool({ name: tools[0].name, arguments: { question } })
    assert.ok(!result.isError)
    assert.deepEqual(result.content, [{ type: 'text', text: answer }])
    assert.deepEqual(JSON.parse(requests.at(-1)!.data), { messages: [{ role: 'user', content: question }] })
    assert.equal(requests.at(-1)!.url, 'https://staging-api.ansari.chat/api/v2/mcp-complete')
  } finally { await client.close() }
})

test('retains empty resource and prompt discovery and accepts standard logging levels', async () => {
  for (const [method, key] of [
    ['resources/list', 'resources'], ['resources/templates/list', 'resourceTemplates'], ['prompts/list', 'prompts'],
  ]) {
    const response = await post({ jsonrpc: '2.0', id: key, method })
    assert.deepEqual((await response.json()).result, { [key]: [] })
  }
  for (const level of ['debug', 'info', 'warning', 'error', 'critical']) {
    const response = await post({ jsonrpc: '2.0', id: level, method: 'logging/setLevel', params: { level } })
    assert.deepEqual((await response.json()).result, {})
  }
})

test('notifications return 202 without a JSON-RPC body; requests keep their IDs', async () => {
  const notification = await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
  assert.equal(notification.status, 202)
  assert.equal(await notification.text(), '')
  const ping = await post({ jsonrpc: '2.0', id: 0, method: 'ping' })
  assert.deepEqual(await ping.json(), { jsonrpc: '2.0', id: 0, result: {} })
  const unknown = await post({ jsonrpc: '2.0', id: 'unknown', method: 'not/a/method' })
  const message = await unknown.json()
  assert.equal(message.id, 'unknown')
  assert.equal(message.error.code, -32601)
})

test('validates version headers, request envelopes, and tool arguments before calling Ansari', async () => {
  const beforeCalls = requests.length
  const badVersion = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { 'MCP-Protocol-Version': 'not-supported' })
  assert.equal(badVersion.status, 400)
  const malformed = await post({ jsonrpc: '1.0', id: 2, method: 'tools/list' })
  assert.equal(malformed.status, 400)
  for (const args of [{}, { question: 42 }, { question: 'valid', extra: 'not permitted' }]) {
    const response = await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
      name: 'answer_islamic_question', arguments: args,
    } })
    assert.equal((await response.json()).result.isError, true)
  }
  assert.equal(requests.length, beforeCalls)
})

test('checks browser origins and permits MCP version and authorization preflight headers', async () => {
  const body = { jsonrpc: '2.0', id: 1, method: 'tools/list' }
  const rejected = await post(body, { Origin: 'https://untrusted.invalid' })
  assert.equal(rejected.status, 403)
  const allowed = await post(body, { Origin: 'http://localhost:3000' })
  assert.equal(allowed.status, 200)
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')
  assert.equal(allowed.headers.get('Vary'), 'Origin')
  const preflight = await fetch(base, { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000' } })
  assert.equal(preflight.status, 204)
  assert.match(preflight.headers.get('Access-Control-Allow-Headers')!, /MCP-Protocol-Version/)
  assert.match(preflight.headers.get('Access-Control-Allow-Headers')!, /Authorization/)
})

test('does not open an idle GET stream or allocate a deletable session', async () => {
  for (const method of ['GET', 'DELETE', 'PUT']) {
    const response = await fetch(base, { method, headers: { Accept: 'text/event-stream' } })
    assert.equal(response.status, 405)
    assert.equal(response.headers.get('Allow'), 'POST, OPTIONS')
  }
})

test('the unchanged FastMCP stdio entry point works with the upgraded SDK dependency', async () => {
  let receivedQuestion: string | undefined
  const upstream = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    receivedQuestion = JSON.parse(body).messages[0].content
    res.end(answer)
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const client = new Client({ name: 'stdio-test', version: '1' })
  try {
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/server.ts', '--api-url', `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`],
      stderr: 'pipe',
    }))
    const { tools } = await client.listTools()
    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'answer_islamic_question')
    const result = await client.callTool({ name: tools[0].name, arguments: { question: 'Original standalone question' } })
    assert.ok(!result.isError)
    assert.deepEqual(result.content, [{ type: 'text', text: answer }])
    assert.equal(receivedQuestion, 'Original standalone question')
  } finally {
    await client.close()
    upstream.closeAllConnections()
    upstream.close()
  }
})
