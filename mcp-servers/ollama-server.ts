import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Ollama } from "ollama";

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

const ollama = new Ollama({ host: OLLAMA_HOST });

export const OllamaServer = new McpServer({
  name: "Ollamaサーバー",
  version: "1.0.0",
});

// Spotify検索用クエリ分類ツール
OllamaServer.tool(
  "classify-spotify-query",
  "自然文をSpotify検索用の {type, keyword} に変換する",
  {
    query: z.string({ description: "ユーザーの自然文入力" }),
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

    let content = response.message?.content || "";
    content = content.replace(/```json\s*([\s\S]*?)```/i, "$1").trim();

    let resultText = "";
    try {
      const json = JSON.parse(content);
      resultText = JSON.stringify(json);
    } catch {
      resultText = JSON.stringify({ type: "track", keyword: query }); // fallback
    }

    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  }
);
