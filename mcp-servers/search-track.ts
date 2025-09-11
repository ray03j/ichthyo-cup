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
    const token = await getAccessToken();
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=3`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const data = await res.json();

    console.log("Spotify API response:", JSON.stringify(data, null, 2)); // ← デバッグ出力


    const tracks = data.tracks.items.map((track: any) => {
      const artists = track.artists.map((a: any) => a.name).join(", ");
      return `${track.name} - ${artists} (${track.external_urls.spotify})`;
    });

    return {
      content: [{ type: "text", text: tracks.join("\n") }],
    };
  }
);

export const SpotifyServer = server;
