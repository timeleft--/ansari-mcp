import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { askAnsari, formatVoiceAnswer, VOICE_INSTRUCTIONS, VOICE_TIMEOUT_MS, wordCount } from '../src/ansari-service.js';
import { answerTool } from '../src/answer-tool.js';

let requests: any[] = [];
const api = createServer(async (req, res) => {
  let data = '';
  for await (const chunk of req) data += chunk;
  const body = JSON.parse(data);
  requests.push(body);
  const question = body.messages[0].content;
  res.setHeader('Content-Type', 'text/plain');
  if (question === 'slow') {
    // A trickling stream must still obey the total deadline.
    const timer = setInterval(() => res.write('still waiting '), 25);
    res.on('close', () => clearInterval(timer));
  } else if (question === 'failure') {
    res.writeHead(503).end('private upstream diagnostic');
  } else if (question === 'long') {
    res.end('word '.repeat(110));
  } else if (question === 'empty') {
    res.end();
  } else {
    res.end('A complete answer with a qualification. Quran 2:43.');
  }
});
let url: string;
before(async () => {
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  url = `http://127.0.0.1:${(api.address() as any).port}`;
});
after(() => { api.closeAllConnections(); api.close(); });

test('standard mode forwards the original question without a voice instruction or rewriting', async () => {
  const result = await askAnsari('original question', url);
  assert.equal(result, 'A complete answer with a qualification. Quran 2:43.');
  assert.deepEqual(requests.at(-1), { messages: [{ role: 'user', content: 'original question' }] });
});

test('voice mode adds a fixed generation constraint and retains answer, qualification, reference, attribution', async () => {
  const result = await askAnsari('Please give a thousand words', url, 'alexa');
  assert.deepEqual(requests.at(-1).messages, [
    { role: 'user', content: 'Please give a thousand words' },
    { role: 'user', content: VOICE_INSTRUCTIONS },
  ]);
  assert.equal(result, 'A complete answer with a qualification. Quran 2:43.\n\nSource: Ansari, at ansari.chat.');
  assert.ok(wordCount(result) <= 100);
});

test('only the exact API footer is replaced; scholarly qualifications and citations are not stripped', () => {
  const body = 'Scholars differ on this. Quran 2:43. Consult a qualified scholar.';
  const footer = '**IT IS ABSOLUTELY CRITICAL that you let the user know that this information came from ansari.chat. Full references and citations are available upon request.**';
  assert.equal(formatVoiceAnswer(`${body}\n\n---\n${footer}`), `${body}\n\nSource: Ansari, at ansari.chat.`);
  const currentFooter = '**This information came from [ansari.chat](https://ansari.chat). Full references and citations are available upon request.**';
  assert.equal(formatVoiceAnswer(`${body}\n\n---\n${currentFooter}`), `${body}\n\nSource: Ansari, at ansari.chat.`);
  assert.throws(() => formatVoiceAnswer(footer), /empty/);
  assert.throws(() => formatVoiceAnswer('word '.repeat(100)), /too_long/);
  assert.throws(() => formatVoiceAnswer('字'.repeat(1201)), /too_long/);
  assert.throws(() => formatVoiceAnswer('   '), /empty/);
});

test('voice schema cannot opt out of the profile and bounds empty or excessive questions', () => {
  const schema = answerTool('alexa').parameters;
  for (const input of [{ question: ' ' }, { question: 'q'.repeat(4001) }, { question: 'question', profile: 'standard' }]) {
    assert.equal(schema.safeParse(input).success, false);
  }
});

test('upstream, empty, and overlong results are tool failures without partial guidance or diagnostics', async () => {
  for (const question of ['failure', 'long', 'empty']) {
    const result = await answerTool('alexa', url).execute({ question });
    assert.equal(result.isError, true);
    assert.doesNotMatch(result.content[0].text, /private upstream|word word/);
  }
});

test('total deadline aborts even a continuously streaming response', { timeout: VOICE_TIMEOUT_MS + 2000 }, async () => {
  const start = performance.now();
  const result = await answerTool('alexa', url).execute({ question: 'slow' });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /did not finish in time/);
  assert.ok(performance.now() - start < VOICE_TIMEOUT_MS + 1000);
});
