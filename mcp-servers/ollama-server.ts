// dist/mcp-servers/ollama-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Ollama } from "ollama";

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

const ollama = new Ollama({ host: OLLAMA_HOST });

const server = new McpServer({
  name: "Ollama分類サーバー",
  version: "1.0.0",
});

// 分類ツール
server.tool(
  "classify-query",
  "Spotify検索用クエリを分類する",
  {
    query: "string",
  },
  async ({ query }) => {
    const prompt = `
あなたはSpotify検索用の分類アシスタントです。
ユーザーの入力に応じて、検索タイプを以下のカテゴリに分類してください:
- "track"（曲）
- "artist"（アーティスト）
- "album"（アルバム）

出力は必ず JSON 形式のみで、以下のキーを持たせてください:
{
  "type": <カテゴリ>,
  "keyword": <検索に使うキーワード>
}

例をいくつか示します:

入力: "Lemon"
出力: {"type": "track", "keyword": "Lemon"}

入力: "米津玄師"
出力: {"type": "artist", "keyword": "米津玄師"}

入力: "Lemon 米津玄師"
出力: {"type": "track", "keyword": "Lemon 米津玄師"}

入力: "アルバム STRAY SHEEP"
出力: {"type": "album", "keyword": "STRAY SHEEP"}

入力: "宇多田ヒカル First Love"
出力: {"type": "album", "keyword": "First Love"}

入力: "${query}"
出力:
`;

    const response = await ollama.chat({
      model: OLLAMA_MODEL,
      messages: [{ role: "user", content: prompt }],
    });

    let content = response.message?.content ?? "";
    content = content.replace(/```json\s*([\s\S]*?)```/i, "$1").trim();

    try {
      const json = JSON.parse(content);
      return json;
    } catch {
      // fallback
      return { type: "track", keyword: query };
    }
  }
);

export const OllamaServer = server;
