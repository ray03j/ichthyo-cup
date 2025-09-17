import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getCurrentTimeTool } from "./mcp-servers/get-current-time.js";
import { getWeatherTool } from "./mcp-servers/get-weather.js";
import { searchTrackTool } from "./mcp-servers/search-track.js";
import { randomUUID } from "crypto";

const app = express();
app.use(express.json());

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});

const mcpServer = new McpServer({ name: "my-server", version: "0.0.1" });

// ツール登録
mcpServer.tool("get-current-time", getCurrentTimeTool);
mcpServer.tool("get-weather", getWeatherTool);
mcpServer.tool("search-track", searchTrackTool);

app.post("/mcp", async (req, res) => {
  try {
    // handleRequest はレスポンスヘッダに sessionId をセットします
    await transport.handleRequest(req, res, req.body);

    // sessionId を取得（stateful モードの場合）
    const sessionId = res.getHeader("Mcp-Session-Id");
    if (sessionId) {
      console.log("Generated sessionId:", sessionId);
    }
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// GET / DELETE は不要なら 405
app.get("/mcp", (_, res) => res.status(405).end());
app.delete("/mcp", (_, res) => res.status(405).end());

app.listen(4000, () => {
  console.log("🚀 MCP server running at http://localhost:4000/mcp");
});

// Ollama サーバーが起動するまで待機する関数
export async function waitForOllama(host: string, retries = 30, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${host}/v1/models`);
      if (res.ok) return; // サーバー応答があれば成功
    } catch {}
    console.log("Waiting for Ollama server...");
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error("Ollama server not responding");
}
