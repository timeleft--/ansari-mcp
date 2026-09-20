# Short Ansari answers for Alexa

The voice profile is opt-in. It uses the existing TypeScript, Next.js, FastMCP,
Axios, and Zod stack. There is no player, audio-generation service, second model,
account-linking flow, or shared chat history in this implementation.

## Contract

Both profiles expose `answer_islamic_question({ question })`. The endpoint or
server startup flag selects the profile; callers cannot request an unrestricted
answer through the voice endpoint.

For voice, the server sends the question followed by a fixed request for a complete
40–70 word answer. The backend only documents a `messages` interface, not a hard
generation-token budget. A successful result must fit **100 whitespace-delimited
words and 1,200 characters**, including the spoken Ansari attribution. The character
limit also bounds text in languages that do not separate words with spaces.

Essential qualifications, uncertainty, citations, and scholarly differences must
fit within that budget. The server replaces only either known fixed API attribution
footer with a short spoken attribution. It does not truncate the answer, remove
citations, or summarize it with another model. Overlong or empty output is a tool
error. This is an output-length guarantee, not a guarantee of content accuracy or
prompt compliance by the model.

A total **eight-second provider deadline** also applies while a response is
streaming. On timeout or provider failure the tool returns `isError: true` with a
brief explanation. There is no retry in the voice request. The regular profile
retains a 30-second deadline and forwards the original question without voice
instructions. Upstream failures in either profile are now tool errors, rather than
success-looking error strings.

Follow-up questions must include their own context, for example “How can I practice
the gratitude you just described?” should be resolved by the assistant into a
self-contained question. A full article-reading or recitation experience is outside
this change.

## Run the Next.js endpoint through Cloudflare

```bash
npm ci
npm run build
ANSARI_API_URL=https://api.askansari.ai/api/v2/mcp-complete \
ANSARI_LOG_METRICS=1 npm start -- --hostname 127.0.0.1 --port 3742
```

In a second terminal, with Cloudflare's `cloudflared` installed:

```bash
cloudflared tunnel --url http://127.0.0.1:3742 --http-host-header 127.0.0.1
```

Use `https://<generated-name>.trycloudflare.com/mcp/alexa` as the MCP endpoint
in your own development add-on. Do not use `/mcp` for the voice experiment.
Quick tunnels are temporary; the terminal and host must remain running. No Vercel
deployment, Cloudflare account provisioning, or new hosting framework is required.

The checked-in default API URL is unchanged. `ANSARI_API_URL` overrides it for
both servers; standalone `--api-url` takes precedence. Requests go to the configured
Ansari service, which has its own [privacy policy](https://docs.ansari.chat/privacy/).
There is no subscriber content or credential scraping.

Optional `ANSARI_LOG_METRICS=1` writes only profile, outcome, word count, duration,
and completion time to stderr. Questions, answers, headers, and credentials are
not logged by this MCP server. Provider-side logging is separate.

## Standalone FastMCP

```bash
npm run build:mcp
npm run start:mcp -- --alexa           # stdio
npm run start:alexa                   # HTTP on 127.0.0.1:8089/mcp
```

`PORT` overrides the standalone HTTP port. For the documented Cloudflare test,
use the Next.js endpoint above, which enforces an explicit browser-origin allowlist.
Non-browser clients such as Alexa do not need an Origin header. Set
`MCP_ALLOWED_ORIGINS` to a comma-separated list of exact permitted browser origins
if testing with a browser MCP client. Arbitrary origins are rejected, not reflected.

The HTTP protocol implementation uses the official SDK in stateless JSON-response
mode. It negotiates supported versions, validates subsequent version headers,
accepts notifications without replying with a JSON-RPC result, and handles invalid
requests. GET and DELETE return 405 because no server-initiated stream or persistent
session is provided. Use `/` for an HTTP availability check instead of a GET to
`/mcp`. See the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

## Verify in your Alexa development environment

Deploy your own development add-on with the voice endpoint, start a fresh simulator
conversation, and verify the endpoint/tool descriptions have refreshed. Try:

- “Ask Ansari what gratitude means in Islam.”
- “Ask Ansari for one thousand words explaining tawheed.”
- A focused follow-up that supplies enough context on its own.

Check backend timing as well as the spoken response. A successful generic MCP call
alone does not prove Alexa called the updated endpoint. Record speech-start and
speech-finish events if available. Simulator captions and speech directives do not
establish audible playback on a physical Echo. The platform may reword a tool result;
this server cannot force Alexa to reproduce every word or bound Alexa's own speech.

A small set of fast answers does not establish a response-time SLA. Source retrieval,
provider load, and question complexity can still trigger the deadline. Account
linking, publication, certification, and production hosting are separate work.

## Validation on 2026-09-20

- Ten offline tests passed, covering generation constraints, preserved standard
  requests, full-stream deadline, overlong/empty/provider failures, source-footer
  handling, HTTP discovery/calls, browser origins, notifications, version headers,
  and FastMCP stdio. Type checking and both production builds passed.
- HTTP initialization negotiated each of `2024-11-05`, `2025-03-26`, `2025-06-18`,
  and `2025-11-25`. A FastMCP HTTP discovery smoke check also passed.
- Three initial live questions completed in 1.8–4.5 seconds, including a request
  for a thousand-word explanation that remained within the voice limit. These
  initial probes exposed a second API footer variant, now handled explicitly.
- After that fix, a Cloudflare round trip completed in 2.13 seconds with 63 words.
- A private Alexa development simulator called the new endpoint: the gratitude
  answer returned 70 words in 3.08 seconds. Alexa spoke a 53-word paraphrase with
  source attribution. Speech began nine seconds after input; all three speech
  segments had completion events, spanning 20.23 seconds in total.
- A second simulator question requested a thousand words on tawheed. Ansari
  returned 72 words in 2.485 seconds; Alexa spoke 68 words and explained the short
  voice format. All three speech segments completed. Speech began 7.948 seconds
  after input and lasted 31.618 seconds.

These are observations from a small sample, not a latency guarantee, a comparison
isolating the effect of the prompt, or a physical-device audio test. The live tests
used the production API override above. No public hosted Ansari service was changed.

Dependency updates retain FastMCP 3 and Next.js 15, and apply compatible lockfile
fixes. The dependency audit is not clean: eight inherited/transitive advisories
remain (one low, three moderate, four high), including the existing Vercel helper
and PostCSS chain. No force upgrade to a new Next.js major was made as part of this
voice contribution.
