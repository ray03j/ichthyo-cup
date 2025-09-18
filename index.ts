import {Ollama} from "ollama";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";

import {DirectServerTransport} from "./libs/direct-transport.js";

import {TimeServer} from "./mcp-servers/get-current-time.js";
import {WeatherServer} from "./mcp-servers/get-weather.js";

import type {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {SpotifyServer} from "./mcp-servers/search-track.js";
import {BraveSearchServer} from "./mcp-servers/brave-search.js";

// MCP ツールをまとめて管理する型
type McpTools = {
    tools: {name: string; description?: string}[]; // ツール一覧
    functionMap: Record<string, Client>; // ツール名 → クライアントの対応表
    close: () => Promise<void>; // 全クライアントを閉じる関数
};

// MCP サーバー群からツール一覧を収集して管理用オブジェクトを作成
const getMcpTools = async (servers: McpServer[]): Promise<McpTools> => {
    const tools: McpTools["tools"] = [];
    const functionMap: Record<string, Client> = {};
    const clients: Client[] = [];

    for (const server of servers) {
        // MCP クライアント作成
        const mcpClient = new Client({
            name: "mcp-client-cli",
            version: "1.0.0",
        });

        // サーバーと直接通信するトランスポートを作成
        const transport = new DirectServerTransport();
        server.connect(transport);
        await mcpClient.connect(transport.getClientTransport());

        clients.push(mcpClient);

        // サーバーが提供するツール一覧を取得
        const toolsResult = await mcpClient.listTools();
        for (const tool of toolsResult.tools) {
            functionMap[tool.name] = mcpClient; // ツール名に対応するクライアントを保存
            tools.push({name: tool.name, description: tool.description});
        }
    }

    // 全クライアントをまとめて閉じる処理
    const close = async () => {
        await Promise.all(clients.map((v) => v.close()));
    };

    return {tools, functionMap, close};
};

// モデルに質問を投げて、さらに MCP ツールも実行する関数
const query = async (
    client: Ollama,
    model: string,
    mcpTools: McpTools,
    prompt: string,
) => {
    console.log(`\n[question] ${prompt}`);

    // Ollama に質問を投げる
    const response = await client.generate({model, prompt});

    // 型安全のため any にキャスト
    const r: any = response;

    // モデルからの回答テキストを整形
    let text = "";
    if (r.output && Array.isArray(r.output)) {
        text = r.output
            .map((o: any) =>
                o.content.map((c: any) => ("text" in c ? c.text : "")).join(""),
            )
            .join("\n");
    }

    console.log("[answer]", text);

    // MCP ツールを順番に呼び出す
    for (const tool of mcpTools.tools) {
        const mcpClient = mcpTools.functionMap[tool.name];
        if (mcpClient) {
            let args: Record<string, any> = {};

            // ツールごとに必要な引数を準備
            if (tool.name === "get-weather") {
                args = {name: "東京"}; // 東京の天気を取得
            }
            // get-current-time は引数不要

            // ツールを呼び出し
            const toolResult = await mcpClient.callTool({
                name: tool.name,
                arguments: args,
            });

            // ツールの結果を表示
            const content = toolResult.content as any[];
            content.forEach((c) => {
                if (c.type === "text")
                    console.log(`[tool: ${tool.name}]`, c.text);
            });
        }
    }
};

// Ollama サーバーが起動するまで待機する関数
export async function waitForOllama(host: string, retries = 30, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(`${host}/v1/models`);
            if (res.ok) return; // サーバー応答があれば成功
        } catch {}
        console.log("Waiting for Ollama server...");
        await new Promise((r) => setTimeout(r, delay));
    }
    throw new Error("Ollama server not responding");
}

// メイン処理
async function main() {
    const host = process.env.OLLAMA_HOST || "http://localhost:11434";
    await waitForOllama(host); // Ollama が起動するまで待つ

    // MCP サーバー（時刻・天気）を登録
    const mcpTools = await getMcpTools([
        TimeServer,
        WeatherServer,
        SpotifyServer,
        BraveSearchServer,
    ]);

    const ollama = new Ollama({host});
    const model = process.env.OLLAMA_MODEL;

    // 後処理
    await mcpTools.close();
}

main();
