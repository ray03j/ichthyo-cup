import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// MCP ツール関数
export const getCurrentTimeTool = async () => {
  const now = new Date().toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return {
    content: [
      {
        type: "text",
        text: now,
      } as const, // ←キャストで text 型と明示
    ],
  };
};

// MCP サーバーに登録
const server = new McpServer({ name: "時間表示サーバー", version: "1.0.0" });
server.tool("get-current-time", getCurrentTimeTool);

export const TimeServer = server;
