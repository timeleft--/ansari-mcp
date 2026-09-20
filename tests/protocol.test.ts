import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createMcpHandler } from '../src/mcp-http.js';

let upstreamCalls = 0;
const api = createServer(async (req, res) => {
  for await (const chunk of req) { /* consume request */ }
  upstreamCalls++;
  res.end('Test answer with a qualification.');
});
const http = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const nextReq = Object.assign(req, { body: body ? JSON.parse(body) : undefined });
  const nextRes = Object.assign(res, {
    status(code: number) { res.statusCode = code; return nextRes; },
    json(data: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return nextRes; },
  });
  await createMcpHandler(req.url === '/mcp/alexa' ? 'alexa' : 'standard')(nextReq as any, nextRes as any);
});
let base: string;
const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
before(async () => {
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  process.env.ANSARI_API_URL = `http://127.0.0.1:${(api.address() as any).port}`;
  http.listen(0, '127.0.0.1'); await once(http, 'listening');
  base = `http://127.0.0.1:${(http.address() as any).port}`;
});
after(() => {
  api.closeAllConnections(); api.close(); http.closeAllConnections(); http.close();
  delete process.env.ANSARI_API_URL;
});
const post = (body: unknown, extra = {}) => fetch(`${base}/mcp/alexa`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });

test('HTTP negotiates 2025-11-25 and previous revisions rather than hard-coding a version', async () => {
  for (const version of ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']) {
    const response = await post({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: version, capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    assert.equal(response.status, 200);
    const message = await response.json();
    assert.equal(message.id, 0);
    assert.equal(message.result.protocolVersion, version);
  }
});

test('SDK client can initialize, discover, and call both isolated profiles', async () => {
  for (const path of ['/mcp', '/mcp/alexa']) {
    const client = new Client({ name: 'test', version: '1' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(base + path)));
      const { tools } = await client.listTools();
      assert.equal(tools.length, 1);
      assert.equal(tools[0].name, 'answer_islamic_question');
      const result = await client.callTool({ name: tools[0].name, arguments: { question: 'A test question' } });
      assert.ok(!result.isError);
      assert.equal((result.content as any)[0].text.includes('Source: Ansari'), path.endsWith('/alexa'));
      const invalid = await client.callTool({ name: tools[0].name, arguments: { question: '' } });
      assert.equal(invalid.isError, true);
    } finally { await client.close(); }
  }
});

test('notifications, unknown methods, unsupported versions, and browser origins are handled correctly', async () => {
  const notification = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), '');
  const unknown = await post({ jsonrpc: '2.0', id: 'unknown', method: 'not/a/method' });
  assert.equal((await unknown.json()).error.code, -32601);
  const badVersion = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { 'MCP-Protocol-Version': 'not-supported' });
  assert.equal(badVersion.status, 400);
  const rejected = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { Origin: 'https://untrusted.invalid' });
  assert.equal(rejected.status, 403);
  const allowed = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { Origin: 'http://localhost:3000' });
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
  assert.equal((await fetch(base + '/mcp/alexa', { headers: { Accept: 'text/event-stream' } })).status, 405);
});

test('FastMCP stdio keeps the same profiles and protocol compatibility', async () => {
  for (const voice of [false, true]) {
    const client = new Client({ name: 'stdio-test', version: '1' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['dist/server.js', ...(voice ? ['--alexa'] : []), '--api-url', process.env.ANSARI_API_URL!],
      stderr: 'pipe',
    });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      assert.equal(tools.length, 1);
      const result = await client.callTool({ name: 'answer_islamic_question', arguments: { question: 'A test question' } });
      assert.ok(!result.isError);
      assert.equal((result.content as any)[0].text.includes('Source: Ansari'), voice);
    } finally { await client.close(); }
  }
  assert.equal(upstreamCalls, 4);
});
