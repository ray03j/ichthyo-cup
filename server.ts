import express from "express";
import cors from "cors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { DirectServerTransport } from "./libs/direct-transport.js";
import { WeatherServer } from "./mcp-servers/get-weather.js";
import { TimeServer } from "./mcp-servers/get-current-time.js";

const app = express();
app.use(cors());
app.use(express.json());

const servers = [WeatherServer, TimeServer];
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

app.listen(3000, () => console.log("Server running at http://localhost:3000"));
