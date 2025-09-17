import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { DirectServerTransport } from "./libs/direct-transport.js";
import { WeatherServer } from "./mcp-servers/get-weather.js";
import { TimeServer } from "./mcp-servers/get-current-time.js";
import { SpotifyServer } from "./mcp-servers/search-track.js";
import { BraveSearchServer } from "./mcp-servers/brave-search.js";
import { OllamaServer } from "./mcp-servers/ollama-server.js";

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

app.use(cors({
  origin: "http://127.0.0.1:3000", // フロントのオリジン
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const servers = [WeatherServer, TimeServer, SpotifyServer, BraveSearchServer, OllamaServer];
const clients: Record<string, Client> = {};

(async () => {
  for (const server of servers) {
    const client = new Client({ name: "web-api-wrapper", version: "1.0.0" });
    const transport = new DirectServerTransport();
    server.connect(transport);
    await client.connect(transport.getClientTransport());

    const tools = await client.listTools();
    for (const tool of tools.tools) {
      // NOTE: tool 名の衝突に注意。現状は最後に登録したものが優先される。
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

// --- Spotify ログイン開始 ---
app.get("/api/auth/login", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("spotify_auth_state", state, {
    httpOnly: true,
    secure: false,
    sameSite: "lax", // クロスオリジンでも Cookie 送信可能
  });

  const scope = "user-read-private user-read-email";
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope,
    state,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${query.toString()}`);
});

// --- Spotify コールバック ---
app.get("/api/auth/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const storedState = req.cookies["spotify_auth_state"];

  if (!state || state !== storedState) return res.status(400).send("State mismatch");
  if (!code) return res.status(400).send("code is required");

  try {
    const tokenUrl = "https://accounts.spotify.com/api/token";
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
    // Cookie にアクセストークンを保存
    res.cookie("spotify_access_token", data.access_token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: data.expires_in * 1000,
    });

    // フロントにリダイレクト
    res.redirect("http://127.0.0.1:3000/chat");
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