import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// 引数スキーマ
const weatherArgsSchema = z.object({
  name: z.string().describe("都市名（例: 東京、大阪、New York）"),
});

// ツール関数は必ず1引数 extra
export const getWeatherTool = async (extra: any) => {
  console.log(extra)
  const args = extra.arguments;
  
  const parsed = weatherArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text" as const, text: "name is required" }],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `天気情報: ${args.name}`,
      }
    ],
  };
};

// MCP サーバーに登録
const server = new McpServer({ name: "天気予報サーバー", version: "1.0.0" });

// ⚡ ここが重要：ZodObject ではなく .shape を渡す
server.tool(
  "get-weather", 
  {
    name: { type: "string", description: "都市名（例: 東京、大阪、New York）" }
  }, 
  getWeatherTool
);

export const WeatherServer = server;
