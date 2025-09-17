import { Ollama } from "ollama";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createInterface } from "readline/promises";

type McpTools = {
  tools: { name: string; description?: string }[];
  functionMap: Record<string, Client>;
  close: () => Promise<void>;
};

const getMcpTools = async (servers: { name: string; url: string }[]): Promise<McpTools> => {
  const tools: McpTools["tools"] = [];
  const functionMap: Record<string, Client> = {};
  const clients: Client[] = [];

  for (const server of servers) {
    const mcpClient = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(server.url), { sessionId: undefined });

    await mcpClient.connect(transport);
    clients.push(mcpClient);

    const toolsResult = await mcpClient.listTools();
    for (const tool of toolsResult.tools) {
      functionMap[tool.name] = mcpClient;
      tools.push({ name: tool.name, description: tool.description });
    }
  }

  const close = async () => {
    await Promise.all(clients.map((v) => v.close()));
  };

  return { tools, functionMap, close };
};

const query = async (client: Ollama, model: string, mcpTools: McpTools, prompt: string) => {
  console.log(`\n[question] ${prompt}`);
  const response: any = await client.generate({ model, prompt });
  const text = response.output?.map((o: any) =>
    o.content?.map((c: any) => c.text ?? "").join("")
  ).join("\n") ?? "";

  console.log("[answer]", text);

  for (const tool of mcpTools.tools) {
    const mcpClient = mcpTools.functionMap[tool.name];
    if (!mcpClient) continue;

    let args: Record<string, any> = {};
    if (tool.name === "get-weather") args = { name: "東京" };

    const toolResult = await mcpClient.callTool({ name: tool.name, arguments: args });
    (toolResult.content as any[]).forEach(c => {
      if (c.type === "text") console.log(`[tool: ${tool.name}]`, c.text);
    });
  }
};

export async function waitForOllama(host: string, retries = 30, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${host}/v1/models`);
      if (res.ok) return;
    } catch {}
    console.log("Waiting for Ollama server...");
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error("Ollama server not responding");
}

// CLI ループ
async function main() {
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";
  await waitForOllama(host);

  const ollama = new Ollama({ host });

  // MCP サーバー URL を指定
  const mcpServers = [
    { name: "time", url: "http://localhost:4000/mcp" },
    { name: "weather", url: "http://localhost:4000/mcp" }
  ];
  const mcpTools = await getMcpTools(mcpServers);

  const readline = createInterface({ input: process.stdin, output: process.stdout });

  while (true) {
    console.log("\nCommands: list-tools | call-tool | exit");
    const answer = await readline.question("Enter command: ");

    switch (answer) {
      case "list-tools":
        mcpTools.tools.forEach(t => console.log(t.name, "-", t.description));
        break;

      case "call-tool":
        const prompt = await readline.question("Enter your prompt: ");
        await query(ollama, "ollama", mcpTools, prompt);
        break;

      case "exit":
        await mcpTools.close();
        readline.close();
        process.exit(0);

      default:
        console.log("Unknown command:", answer);
    }
  }
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
