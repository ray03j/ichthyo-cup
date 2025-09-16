import express from "express";
import cors from "cors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { DirectServerTransport } from "./libs/direct-transport.js";
import { WeatherServer } from "./mcp-servers/get-weather.js";
import { TimeServer } from "./mcp-servers/get-current-time.js";
import { SpotifyServer } from "./mcp-servers/search-track.js";

// 環境変数から取得
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!;

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

const app = express();
app.use(cors());
app.use(express.json());

const servers = [WeatherServer, TimeServer, SpotifyServer];
const clients: Record<string, Client> = {};

(async () => {
  for (const server of servers) {
    const client = new Client({ name: "web-api-wrapper", version: "1.0.0" });
    const transport = new DirectServerTransport();
    server.connect(transport);
    await client.connect(transport.getClientTransport());

    const tools = await client.listTools();
    for (const tool of tools.tools) {
      clients[tool.name] = client;
    }
  }
})();

// REST API
// --- MCP ツール呼び出し用 API ---
app.post("/api/tool/:name", async (req, res) => {
  const toolName = req.params.name;
  const args = req.body || {};

  const client = clients[toolName];
  if (!client) return res.status(404).json({ error: "Tool not found" });

  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- GET: Spotify 認可コードを受け取る ---
app.get("/api/auth/callback", (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.status(400).send("code is required");

  // フロントエンドにcodeを返す
  res.json({ code });
});

// --- POST: 認可コードをアクセストークンに交換する ---
app.post("/api/auth/callback", async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "code is required" });

  const tokenUrl = "https://accounts.spotify.com/api/token";

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const data = (await response.json()) as SpotifyTokenResponse;
    if (!response.ok) {
      return res.status(500).json({ error: data });
    }

    res.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Spotify API を呼ぶ例 (/me) ---
app.get("/api/me", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const response = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.listen(4000, '0.0.0.0', () => {
  console.log("Server running at http://127.0.0.1:4000");
});