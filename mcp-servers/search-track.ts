import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;

async function getAccessToken() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token as string;
}

async function classifyQuery(query: string) {
  console.log("=== Ollama Classify ===");
  console.log("入力クエリ:", query);
  console.log("使用モデル:", OLLAMA_MODEL);

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


  try {
    await waitForOllama(OLLAMA_HOST); // Ollama が起動するまで待つ

    const response = await ollama.chat({
      model: OLLAMA_MODEL,
      messages: [{ role: "user", content: prompt }],
    });

    console.log("Classify raw response:", response);

    if (!response?.message?.content) {
      console.warn("⚠ Ollama 応答に content がありません。fallback に移行します");
      return { type: "track", keyword: query };
    }

    try {
      let content = response.message.content;

      // ```json ... ``` のコードブロックを除去
      content = content.replace(/```json\s*([\s\S]*?)```/i, '$1').trim();

      const json = JSON.parse(content);
      console.log("Classify parsed JSON:", json);
      return json;
    } catch (parseErr) {
      console.error("⚠ JSON parse error:", parseErr);
      return { type: "track", keyword: query }; // fallback
    }
  } catch (err) {
    console.error("⚠ Ollama API 呼び出しエラー:", err);
    return { type: "track", keyword: query }; // fallback
  }
}

const server = new McpServer({
  name: "Spotifyサーバー",
  version: "1.0.0",
});

// 曲検索ツール
server.tool(
  "search-track",
  "Spotifyで曲を検索する",
  {
    query: z.string({ description: "検索したい曲名やアーティスト名" }),
  },
  async ({ query }) => {
    const { type, keyword } = await classifyQuery(query);

    const token = await getAccessToken();
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(
        keyword
      )}&type=${type}&limit=3`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const data = await res.json();

    const items =
      data[type + "s"].items.map((item: any) => {
        if (type === "track") {
          const artists = item.artists.map((a: any) => a.name).join(", ");
          return `${item.name} - ${artists} (${item.external_urls.spotify})`;
        } else if (type === "artist") {
          return `Artist: ${item.name} (${item.external_urls.spotify})`;
        } else if (type === "album") {
          return `Album: ${item.name} - ${item.artists
            .map((a: any) => a.name)
            .join(", ")} (${item.external_urls.spotify})`;
        }
      }) ?? [];

    return {
      content: [{ type: "text", text: tracks.join("\n") }],
    };
  }
);

export const SpotifyServer = server;
