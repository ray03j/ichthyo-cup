import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import {Ollama} from "ollama";
import {waitForOllama} from "../index.js";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const BRAVE_API_KEY = process.env.BRAVE_API_KEY!;

const ollama = new Ollama({host: OLLAMA_HOST});

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

// 1. Ollamaで自由に推論して関連情報を取得
async function ollamaFreeInference(query: string) {
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
        messages: [{role: "user", content: prompt}],
    });

    let content = response.message.content;
    content = content.replace(/```json\s*([\s\S]*?)```/i, "$1").trim();

    try {
        const json = JSON.parse(content);
        return json; // [{type, keyword}, ...]
    } catch (err) {
        console.warn("Ollama 推論 JSON parse error, fallback:", err);
        return [{type: "playlist", keyword: query}];
    }
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
        query: z.string({description: "検索したい曲名やアーティスト名"}),
    },
    async ({query}) => {
        // 1. Ollama で自由推論を実行し、複数の候補を取得
        const inferences = await ollamaFreeInference(query);
        console.log("Ollama inferences:", inferences);

        // 2. Spotifyのアクセストークンを取得
        const token = await getAccessToken();

        // 3. 各推論結果に対して並列でSpotify検索を実行
        const searchPromises = inferences.map((inference: any) => {
            const {type, keyword} = inference;

            const validType = ["track", "artist", "album", "playlist"].includes(
                type,
            )
                ? type
                : "playlist";
            const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
                keyword,
            )}&type=${validType}&market=JP&limit=1`; // 各検索で最も関連性の高い1件を取得

            return fetch(url, {
                headers: {Authorization: `Bearer ${token}`},
            }).then((res) => res.json());
        });

        const searchResults = await Promise.all(searchPromises);

        // 4. すべての検索結果を整形してまとめる
        const items = searchResults.flatMap((data, index) => {
            const inference = inferences[index];
            const type = ["track", "artist", "album", "playlist"].includes(
                inference.type,
            )
                ? inference.type
                : "playlist";
            const resultItems = data[type + "s"]?.items;

            if (!resultItems || resultItems.length === 0) {
                return [
                    `- '${inference.keyword}' の検索結果が見つかりませんでした。`,
                ];
            }

            const item = resultItems[0];
            if (type === "track") {
                const artists = item.artists.map((a: any) => a.name).join(", ");
                return [
                    `- ${item.name} - ${artists} (${item.external_urls.spotify})`,
                ];
            } else if (type === "artist") {
                return [
                    `- Artist: ${item.name} (${item.external_urls.spotify})`,
                ];
            } else if (type === "album") {
                const artists = item.artists.map((a: any) => a.name).join(", ");
                return [
                    `- Album: ${item.name} - ${artists} (${item.external_urls.spotify})`,
                ];
            } else if (type === "playlist") {
                return [
                    `- Playlist: ${item.name} (${item.external_urls.spotify})`,
                ];
            }
            return [];
        });

        return {
            content: [{type: "text", text: items.join("\n")}],
        };
    },
);

export const SpotifyServer = server;
