import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;

async function getAccessToken() {
    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization:
                "Basic " +
                Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
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

server.tool(
    "search-spotify",
    "Spotifyで曲を検索する",
    {
        type: z.enum(["track", "artist", "album"]),
        keyword: z.string({ description: "検索キーワード（track/album の場合は「曲名 アーティスト名」形式推奨）" }),
    },
    async ({ type, keyword }) => {
        const token = await getAccessToken();

        const res = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(keyword)}&type=${type}&limit=3&market=JP`,
            { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!res.ok) {
            console.error("Spotify API error", await res.text());
            return { content: [{ type: "text", text: "Spotify検索中にエラーが発生しました。" }] };
        }

        const data = await res.json();
        const items = data[type + "s"]?.items ?? [];

        if (items.length === 0) {
            return { content: [{ type: "text", text: "検索結果が見つかりませんでした。" }] };
        }

        const results = items.map((item: any) => {
            if (type === "track") {
                const artists = item.artists.map((a: any) => a.name).join(", ");
                return `${item.name} - ${artists} (${item.external_urls.spotify})`;
            } else if (type === "artist") {
                return `Artist: ${item.name} (${item.external_urls.spotify})`;
            } else if (type === "album") {
                return `Album: ${item.name} - ${item.artists.map((a: any) => a.name).join(", ")} (${item.external_urls.spotify})`;
            }
            return "";
        });

        return {
            content: [{type: "text", text: results.join("\n")}]};
    },
);

export const SpotifyServer = server;
