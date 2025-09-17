// dist/mcp-servers/spotify-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const OLLAMA_HOST = process.env.OLLAMA_HOSTy || "http://localhost:4001"; // OllamaServerのMCP URL

async function getAccessToken() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token as string;
}

const server = new McpServer({
  name: "Spotifyサーバー",
  version: "1.0.0",
});

// 曲検索ツール
server.tool(
  "search-track",
  "Spotifyで曲を検索する",
  { query: "string" },
  async ({ query }) => {
    // OllamaServer に分類を依頼
    const client = new McpClient({ url: OLLAMA_HOST });
    const { type, keyword } = await client.call("classify-query", { query });

    const token = await getAccessToken();
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(keyword)}&type=${type}&limit=3`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();

    const items =
      data[type + "s"]?.items.map((item: any) => {
        if (type === "track") {
          const artists = item.artists.map((a: any) => a.name).join(", ");
          return `${item.name} - ${artists} (${item.external_urls.spotify})`;
        } else if (type === "artist") {
          return `Artist: ${item.name} (${item.external_urls.spotify})`;
        } else {
          return `Album: ${item.name} - ${item.artists.map((a: any) => a.name).join(", ")} (${item.external_urls.spotify})`;
        }
      }) ?? [];

    return { content: [{ type: "text", text: items.join("\n") }] };
  }
);

export const SpotifyServer = server;
