import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";

// 環境変数からAPIキーを読み込む
const API_KEY = process.env.BRAVE_API_KEY;

// McpServerのインスタンスを作成
const server = new McpServer({
    name: "Brave Searchサーバー",
    version: "1.0.0",
});

// "brave-search" という名前のツールを定義
server.tool(
    "brave-search",
    "Brave Search APIを使ってウェブ検索を実行する",
    {
        // 入力として "query" (文字列) を受け取る
        query: z.string({description: "検索したいキーワード"}),
    },
    async ({query}) => {
        // APIキーが設定されていない場合はエラーを返す
        if (!API_KEY) {
            return {
                content: [
                    {
                        type: "text",
                        text: "エラー: 環境変数 BRAVE_API_KEY が設定されていません。",
                    },
                ],
            };
        }

        console.log(`[Brave Search] クエリ: "${query}" で検索を実行します...`);

        try {
            // Brave Search APIのエンドポイント
            const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&country=JP`;

            // APIリクエストを送信
            const response = await fetch(url, {
                headers: {
                    "X-Subscription-Token": API_KEY,
                    Accept: "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(
                    `Brave Search API request failed with status ${response.status}`,
                );
            }

            const data = await response.json();

            // 検索結果を整形 (上位3件)
            const items = data.web?.results
                .slice(0, 3)
                .map(
                    (item: any, index: number) =>
                        `${index + 1}. ${item.title}\n   - URL: ${item.url}\n   - 概要: ${item.description}`,
                )
                .join("\n\n") || "検索結果が見つかりませんでした。";

      return { content: [{ type: "text", text: items }] };

        } catch (error) {
            console.error("Brave Searchでエラーが発生しました:", error);
            return {
                content: [
                    {type: "text", text: "検索中にエラーが発生しました。"},
                ],
            };
        }
    },
);

// サーバーインスタンスをエクスポート
export const BraveSearchServer = server;
