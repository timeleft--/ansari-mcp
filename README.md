# Ansari MCP Server

An MCP (Model Context Protocol) server that provides Islamic knowledge through the Ansari API. This server allows Claude Desktop, Claude Code, Cursor, and other MCP clients to answer Islamic questions with authentic sources from the Quran and Hadith.

## Hosted Server

The Ansari MCP server is available as a hosted service at:
```
https://mcp.ansari.chat/mcp
```

You can use this URL directly in Claude Code or with adapters for Claude Desktop and Cursor (see setup instructions below).

## Hosted MCP protocol update

This branch replaces the hosted route's handwritten JSON-RPC dispatch with the
official MCP SDK. It negotiates `2025-11-25`, `2025-06-18`, `2025-03-26`, and
`2024-11-05` over the JSON-response Streamable HTTP endpoint. This is a branch
capability, not a claim that the public service has deployed the update. The
legacy HTTP+SSE transport and the newer `2026-07-28` protocol are not implemented.

The original `answer_islamic_question` tool, question text, answer text, provider
URL, and provider timeout are preserved. Empty resource and prompt listings
remain available. The SDK also accepts `logging/setLevel`; the hosted route emits
no question, answer, or header logs and does not retain a process-global verbosity
setting across requests. The standalone application keeps its original tool behavior;
FastMCP is updated within major version 3 because the older release fails to start
with the newer SDK (it registers completion handlers without that capability).
Its CLI dependencies require Node 20.19+, 22.12+, or 23 and newer.

Migration notes:

- POST responses use JSON without allocating an MCP session. Valid notifications
  receive HTTP 202 without a response body.
- GET and DELETE return HTTP 405; use `/` for availability checks instead of the
  previous GET `/mcp` information response. No idle server-event stream is opened.
- Browser requests must use an allowed Origin. `MCP_ALLOWED_ORIGINS` accepts a
  comma-separated list of exact origins; the defaults are `https://mcp.ansari.chat`,
  `http://localhost:3000`, and `http://127.0.0.1:3000`. Native clients need no Origin.
- The SDK validates request envelopes, version headers, and the tool's advertised
  schema. Invalid tool arguments return tool errors before invoking Ansari.
- Requests must accept both `application/json` and `text/event-stream`, as required
  by Streamable HTTP clients. OPTIONS supports browser preflight.

The SDK removes bespoke protocol maintenance and keeps this endpoint compatible
with a request/response deployment. Hosting savings have not been measured: the
previous handler already used JSON responses without a persistent event stream.
The [2025 transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
permits this configuration; the
[2026 protocol's handshake removal](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
is a separate migration.

Run `npm test` for HTTP contract checks with a controlled downstream response,
and `npm run build` for Next.js compilation and type checking.

## Quick Start - Using the Hosted Server

The easiest way to use Ansari MCP is through our hosted server. No installation required!

### Claude Desktop

1. Open Claude Desktop and click on your profile/name in the bottom left corner
   ![Claude Settings Menu](docs/images/settings-small.png)

2. Select "Settings" from the menu
   ![Claude Settings](docs/images/settings2-small.png)

3. Navigate to "Developer" tab and click "Edit Config"
   ![Edit Config Button](docs/images/settings3-small.png)

4. This will open the `claude_desktop_config.json` file in your default text editor
   - **macOS**: Located at `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: Located at `%APPDATA%\Claude\claude_desktop_config.json`

5. Add this configuration:
```json
{
  "mcpServers": {
    "ansari": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.ansari.chat/mcp"
      ]
    }
  }
}
```

6. Restart Claude Desktop completely (Cmd+Q / Alt+F4 and reopen)

### Claude Code

1. Open your project in Claude Code
2. Add to your `.claude.json` or global configuration:
```json
{
  "mcpServers": {
    "ansari": {
      "type": "http",
      "url": "https://mcp.ansari.chat/mcp"
    }
  }
}
```

### Visual Studio Code (with MCP Extension)

If you have an MCP extension installed in VS Code:

1. Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
2. Run "MCP: Add Server..."
3. Select "HTTP (HTTP or Server-Sent Events)"
4. Enter URL: `https://mcp.ansari.chat/mcp`
5. Name it: "Ansari"

### Cursor

Cursor supports HTTP MCP servers directly:

```json
{
  "mcpServers": {
    "ansari": {
      "type": "http",
      "url": "https://mcp.ansari.chat/mcp"
    }
  }
}
```

## Local Installation (Optional)

If you prefer to run the server locally:

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation Steps

1. Clone the repository:
```bash
git clone https://github.com/ansari-project/ansari-mcp.git
cd ansari-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the TypeScript code:
```bash
npm run build
```

## Development

### Building the Project

**Important**: After making ANY changes to the TypeScript source files in `src/`, you MUST rebuild:

```bash
npm run build
```

## Configuration

### API Endpoint

By default, the server connects to:
```
https://staging-api.ansari.chat/api/v2/mcp-complete
```

You can override this with the `--api-url` (or `-u`) flag:

```bash
npm start -- --api-url https://custom-api.example.com/api/endpoint
```

## Running the Server

### Mode 1: stdio (for Claude Desktop & Claude Code)

This is the default mode for integration with Claude Desktop and Claude Code:

```bash
npm start
```

### Mode 2: HTTP (for testing)

To run in HTTP mode for testing with curl or other HTTP clients:

```bash
npm start -- --http
```

The server will be available at: `http://localhost:8089/mcp`

## Local Server Configuration

If you're running the server locally instead of using the hosted version:

### Claude Desktop (Local)

```json
{
  "mcpServers": {
    "ansari": {
      "command": "node",
      "args": ["/absolute/path/to/ansari-mcp/dist/server.js"],
      "env": {}
    }
  }
}
```

### Claude Code (Local)

```json
{
  "mcpServers": {
    "ansari": {
      "command": "node",
      "args": ["/absolute/path/to/ansari-mcp/dist/server.js"],
      "env": {}
    }
  }
}
```

### Cursor (Local)

```json
{
  "mcpServers": {
    "ansari": {
      "command": "node",
      "args": ["/absolute/path/to/ansari-mcp/dist/server.js"],
      "env": {}
    }
  }
}
```

**Note**: Replace `/absolute/path/to/ansari-mcp` with your actual installation path.

## Usage

Once configured, you can ask Islamic questions in Claude Desktop or Claude Code:

1. Start a new conversation
2. The Ansari tool will be available automatically
3. Ask Islamic questions naturally, for example:
   - "What are the five pillars of Islam?"
   - "What does the Quran say about charity?"
   - "Explain the concept of Tawheed"
   - "How many times is prayer mentioned in the Quran?"

Claude will use the Ansari tool to provide answers with authentic citations from the Quran and Hadith.

## Testing

### Test the API Connection Directly

```bash
# Create a test file
cat > test-api.mjs << 'EOF'
import { askAnsari } from './dist/ansari-service.js';
askAnsari('What is zakat?').then(console.log);
EOF

# Run the test
node test-api.mjs
```

### Test with MCP Inspector

Install and run the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector dist/server.js
```

This will open a web interface where you can test the tool interactively.

### Test in HTTP Mode

1. Start the server:
```bash
npm start -- --http
```

2. The server will run at `http://localhost:8089/mcp`

## Troubleshooting

### "Unexpected token" Error in Claude Desktop

**Problem**: You see `MCP ansari: Unexpected token 'C', "Calling An"... is not valid JSON`

**Solution**: This occurs when console.log statements interfere with the MCP protocol. The code should already have these removed, but if you add any debugging:
- Remove ALL `console.log()` statements
- Remove ALL `console.error()` statements
- Only pure JSON-RPC communication should go to stdout

### Changes Not Taking Effect

**Problem**: You modified the code but changes aren't working

**Solution**: You MUST rebuild after every change:
```bash
npm run build
```

### Claude Desktop Not Finding the Tool

**Problem**: The Ansari tool doesn't appear in Claude Desktop

**Solutions**:
1. Verify the path in `claude_desktop_config.json` is absolute and correct
2. Ensure you ran `npm run build` successfully
3. Completely restart Claude Desktop (quit and reopen)
4. Check the build output exists: `ls dist/server.js`

### Connection to API Fails

**Problem**: "Failed to fetch answer from Ansari API"

**Solutions**:
1. Check your internet connection
2. Verify the API is accessible: `curl https://staging-api.ansari.chat/api/v2/mcp-complete`
3. Try with a custom API URL if you have one

### Build Errors

**Problem**: TypeScript compilation fails

**Solution**:
```bash
# Clean and rebuild
rm -rf dist/
npm run build
```

## Project Structure

```
ansari-mcp/
├── src/
│   ├── server.ts           # Main MCP server implementation
│   └── ansari-service.ts   # Ansari API client service
├── dist/                   # Compiled JavaScript (generated by build)
│   ├── server.js          # Compiled server
│   └── ansari-service.js  # Compiled service
├── tmp/                    # Temporary test files (git-ignored)
├── package.json           # Project dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── README.md             # This file
```

## Important Notes

- **Always rebuild after changes**: Run `npm run build` after modifying ANY TypeScript files
- **No console output in stdio mode**: Console statements will break the MCP protocol
- **Use absolute paths**: In Claude Desktop/Code configs, always use absolute paths
- **Restart after config changes**: Always restart Claude Desktop/Code after changing configuration

## API Information

The Ansari API provides:
- Quranic verses with Arabic text and English translations
- Authentic Hadith with grading and sources
- Scholarly explanations based on classical Islamic texts
- Proper citations with chapter, verse, and hadith numbers

## Support

For issues or questions:
- Check the [Issues](https://github.com/ansari-project/ansari-mcp/issues) page
- API Documentation: https://staging-api.ansari.chat/redoc
- Contact the Ansari project team

## License

[Your License Here]