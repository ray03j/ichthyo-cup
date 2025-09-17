import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Ollama } from "ollama";

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const BRAVE_API_KEY = process.env.BRAVE_API_KEY!;

const ollama = new Ollama({ host: OLLAMA_HOST });

export const OllamaServer = new McpServer({
  name: "Ollamaサーバー",
  version: "1.0.0",
});

async function braveSearch(query: string): Promise<string> {
    if (!BRAVE_API_KEY) {
        console.warn("BRAVE_API_KEY is not set. Skipping web search.");
        return "Web search was not performed.";
    }

    try {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query + " 曲")}&country=JP`;
        const response = await fetch(url, {
            headers: {
                "X-Subscription-Token": BRAVE_API_KEY,
                Accept: "application/json",
            },
        });
        if (!response.ok)
            return `Search failed with status: ${response.status}`;

        const data = await response.json();

        return data.web?.results
            .slice(0, 20)
            .map(
                (item: any) =>
                    `Title: ${item.title}\nURL: ${item.url}\nSnippet: ${item.description}`,
            )
            .join("\n\n---\n\n");
    } catch (error) {
        console.error("Brave Search failed:", error);
        return "An error occurred during web search.";
    }
}


// Spotify検索用クエリ分類ツール
OllamaServer.tool(
  "classify-spotify-query",
  "自然文をSpotify検索用の {type, keyword} に変換する",
  {
    query: z.string({ description: "ユーザーの自然文入力" }),
  },
  async ({ query }) => {
    console.log(`[Brave Search] Searching for: "${query}"`);
    const searchResults = await braveSearch(query);
    console.log("[Brave Search] Results received.");

    const prompt = `
# 命令(Instruction)
あなたは、与えられたウェブ検索結果から楽曲情報を正確に抽出し、指定されたJSON形式で出力するAIです。提供された情報源に忠実に従ってください。

# 入力情報(Input)

ユーザーの入力: "${query}"

ウェブ検索結果:
"""
${searchResults}
"""

# 出力ルール(Output Rules)

出力はJSON配列のみとし、説明文などを一切含めないでください。

配列の各要素は、「type」と「keyword」のキーを持つJSONオブジェクトとします。

配列の要素数は最大3つまでにしてください。

keywordは具体的な楽曲、アーティスト、アルバム、またはプレイリストを指す文字列とします。

「type」が「track」または「album」の場合、「keyword」の値は**絶対に「曲名またはアルバム名」「半角スペース」「アーティスト名」の形式にしてください。**このルールを厳守してください。

ウェブ検索結果から適切な楽曲が見つからない場合、空の配列 [] を出力してください。

# 手本(Example)

入力例
ユーザーの入力: "2023年にヒットしたJ-POP"

ウェブ検索結果:
"""
2023年の音楽シーンを振り返ると、Official髭男dismの「Subtitle」が年間トップでした。また、YOASOBIの「アイドル」はアニメ主題歌として世界的なヒットを記録しました。アルバムでは、Mrs. GREEN APPLEの「ANTENNA」が多くのファンに支持されました。
"""

出力例
[
{"type": "track", "keyword": "Subtitle Official髭男dism"},
{"type": "track", "keyword": "アイドル YOASOBI"},
{"type": "album", "keyword": "ANTENNA Mrs. GREEN APPLE"}
]

# 出力
    `;

    const response = await ollama.chat({
      model: OLLAMA_MODEL,
      messages: [{ role: "user", content: prompt }],
    });

    let content = response.message?.content || "";
    content = content.replace(/```json\s*([\s\S]*?)```/i, "$1").trim();

    let resultText = "";
    try {
      const json = JSON.parse(content);
      resultText = JSON.stringify(json);
    } catch {
      resultText = JSON.stringify([{ type: "track", keyword: query }]);
    }

    return { content: [{ type: "text", text: resultText }] };
  },
);
