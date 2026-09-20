import axios from 'axios';

// Default API URL - can be overridden via command line
export const DEFAULT_ANSARI_API_URL = 'https://staging-api.ansari.chat/api/v2/mcp-complete';

export async function askAnsari(question: string, apiUrl: string = DEFAULT_ANSARI_API_URL): Promise<string> {
    try {
        const data = {
            "messages": [
                {
                    "role": "user", 
                    "content": question
                }
            ]
        }
        // Don't log to console in stdio mode - it breaks MCP protocol
        const response = await axios.post(apiUrl, data, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 30000, // 30 second timeout
        });
        
        // The API returns a string directly
        if (typeof response.data === 'string') {
            return response.data;
        } else if (response.data) {
            // Fallback for other response formats
            return JSON.stringify(response.data);
        } else {
            return "No answer from Ansari.";
        }
    } catch (error: unknown) {
        // Don't log errors to console in stdio mode - it breaks MCP protocol
        // Errors will be returned as part of the response
        const errorMsg = (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string')
            ? error.message
            : String(error);
        return `Failed to fetch answer from Ansari API: ${errorMsg}`;
    }
}
