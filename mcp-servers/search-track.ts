import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Ollama } from "ollama";
import { waitForOllama } from "../index.js";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

const ollama = new Ollama({ host: OLLAMA_HOST });

async function getAccessToken() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization":
        "Basic " +
        Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token as string;
}

// 1. Ollamaで自由に推論して関連情報を取得
async function ollamaFreeInference(query: string) {
  const prompt = `
あなたは音楽に詳しいアシスタントです。
ユーザーの入力 "${query}" について、
曲名、アーティスト名、アルバム名に加えて、
関連するグループやジャンルなども抽象的にまとめてください。
出力は JSON 配列で、各要素は "type" (track / artist / album / group / genre) と "keyword" を持ちます。
JSON 形式のみで出力してください。

例:
入力: "Lemon 米津玄師"
出力: [
  {"type": "track", "keyword": "Lemon"},
  {"type": "artist", "keyword": "米津玄師"}
]

入力: "宇多田ヒカル First Love"
出力: [
  {"type": "album", "keyword": "First Love"},
  {"type": "artist", "keyword": "宇多田ヒカル"}
]

入力: "RADWIMPS 前前前世"
出力: [
  {"type": "track", "keyword": "前前前世"},
  {"type": "artist", "keyword": "RADWIMPS"}
]

入力: "坂道グループ"
出力: [
  {"type": "group", "keyword": "乃木坂46"},
  {"type": "group", "keyword": "欅坂46"},
  {"type": "group", "keyword": "日向坂46"}
]

入力: "BUMP OF CHICKEN 天体観測"
出力: [
  {"type": "track", "keyword": "天体観測"},
  {"type": "artist", "keyword": "BUMP OF CHICKEN"},
  {"type": "genre", "keyword": "ロック"}
]

入力: "Official髭男dism Pretender"
出力: [
  {"type": "track", "keyword": "Pretender"},
  {"type": "artist", "keyword": "Official髭男dism"},
  {"type": "genre", "keyword": "ポップ"}
]

入力: "あいみょん マリーゴールド"
出力: [
  {"type": "track", "keyword": "マリーゴールド"},
  {"type": "artist", "keyword": "あいみょん"},
  {"type": "genre", "keyword": "J-POP"}
]

入力: "${query}"
出力:
`;

  const response = await ollama.chat({
    model: OLLAMA_MODEL,
    messages: [{ role: "user", content: prompt }],
  });

  let content = response.message.content;
  content = content.replace(/```json\s*([\s\S]*?)```/i, "$1").trim();

  try {
    const json = JSON.parse(content);
    return json; // [{type, keyword}, ...]
  } catch (err) {
    console.warn("Ollama 推論 JSON parse error, fallback:", err);
    return [{ type: "track", keyword: query }];
  }
}

// 2. 分類関数（推論結果から検索用に選ぶ）
async function classifyInference(inference: any[]) {
  const prompt = `
あなたはSpotify検索用の分類アシスタントです。
次の入力から、検索タイプを "track" / "artist" / "album" のいずれかに分類してください。
出力は JSON 形式で {"type": ..., "keyword": ...} のみ返してください。

例:
入力: [{"type":"track","keyword":"Lemon"},{"type":"artist","keyword":"米津玄師"}]
出力: {"type": "track", "keyword": "Lemon 米津玄師"}

入力: [{"type":"album","keyword":"First Love"},{"type":"artist","keyword":"宇多田ヒカル"}]
出力: {"type": "album", "keyword": "First Love"}

入力: [{"type":"track","keyword":"前前前世"},{"type":"artist","keyword":"RADWIMPS"}]
出力: {"type": "track", "keyword": "前前前世 RADWIMPS"}

入力: ${JSON.stringify(inference)}
出力:
`;

  const response = await ollama.chat({
    model: OLLAMA_MODEL,
    messages: [{ role: "user", content: prompt }],
  });

  let content = response.message.content;
  content = content.replace(/```json\s*([\s\S]*?)```/i, "$1").trim();

  try {
    const json = JSON.parse(content);
    return json; // {type, keyword}
  } catch (err) {
    console.warn("Ollama 分類 JSON parse error, fallback:", err);
    return { type: inference[0]?.type || "track", keyword: inference[0]?.keyword || "" };
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
    // 1. Ollama で自由推論
    const inference = await ollamaFreeInference(query);
    console.log("Ollama inference:", inference);

    // 2. 推論結果を分類して Spotify 検索用に変換
    const { type, keyword } = await classifyInference(inference);
    console.log("Selected for Spotify:", type, keyword);

    // 3. Spotify検索
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
      content: [{ type: "text", text: items.join("\n") }],
    };
  }
);

export const SpotifyServer = server;
