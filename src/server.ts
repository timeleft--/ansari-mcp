import { FastMCP } from 'fastmcp';
import { answerTool } from './answer-tool.js';
import { DEFAULT_ANSARI_API_URL } from './ansari-service.js';

const args = process.argv.slice(2);
const isHttpMode = args.includes('--http') || args.includes('-h');
const profile = args.includes('--alexa') ? 'alexa' : 'standard';
const apiUrlIndex = args.findIndex(arg => arg === '--api-url' || arg === '-u');
const apiUrl = apiUrlIndex !== -1 && args[apiUrlIndex + 1]
  ? args[apiUrlIndex + 1] : process.env.ANSARI_API_URL || DEFAULT_ANSARI_API_URL;
const server = new FastMCP({ name: profile === 'alexa' ? 'Ansari Voice' : 'Ansari', version: '1.0.0' });
server.addTool(answerTool(profile, apiUrl));

if (isHttpMode) {
  await server.start({
    transportType: 'httpStream',
    httpStream: { host: '127.0.0.1', port: Number(process.env.PORT || 8089), endpoint: '/mcp', stateless: true, enableJsonResponse: true },
  });
} else {
  await server.start();
}

async function stop() {
  await server.stop();
  process.exit(0);
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
