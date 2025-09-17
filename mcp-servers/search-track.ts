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
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&country=JP`;
        const response = await fetch(url, {
            headers: {
                "X-Subscription-Token": BRAVE_API_KEY,
                Accept: "application/json",
            },
        });
        if (!response.ok)
            return `Search failed with status: ${response.status}`;

        const data = await response.json();
        // 検索結果の上位3件を要約して返す
        return data.web?.results
            .slice(0, 3)
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
あなたは音楽に詳しいアシスタントです。
ユーザーの入力 "${query}" について、ウェブ検索を実行しました。

[ウェブ検索結果]
${searchResults}
[ウェブ検索結果ここまで]

上記のウェブ検索結果の情報のみを参考にして、ユーザーの入力に最も関連性の高い曲を3曲提案し、
曲名、アーティスト名、アルバム名をまとめてください。

下記は代表的な音楽ジャンルと、それを形成するとされる要素の目安を一覧にしたものです。

「ロック」の曲調を形成する要素:
・歪んだエレキギターのサウンド
・速いテンポ
・激しい演奏
・叫ぶようなボーカル
・ギター、ベース、ドラムのバンド編成によるサウンド
・体を動かしたくなるようなリズム

「R&B」の曲調を形成する要素:
・16ビート（横ノリ）のリズム
・複雑なハーモニー
・きらびやかな雰囲気のあるサウンド
・ソウルフルな（深みのある）ボーカル

「ポップ」の曲調を形成する要素:
・明るいサウンド
・親しみやすいサウンド
・コミカルな雰囲気のあるサウンド
・曲構成が明確で把握しやすい
・理解しやすく共感しやすい歌詞のテーマ
・軽快なリズム

「ジャズ」の曲調を形成する要素:
・ドラム、ベース、アコースティックピアノに管楽器を含む編成によるサウンド
・4ビートのリズム（それを体現するベースの奏法）
・複雑なハーモニー
・インプロビゼーション（即興）的な演奏内容
・管楽器のソロパート
・アフリカ音楽的な（西洋音楽的な要素が希薄な）リズムと音階の解釈

「EDM」の曲調を形成する要素:
・シンセサイザーなどのデジタルサウンド
・音圧のあるサウンド
・踊り出したくなるようなリズム
・規則的なリズム

「フォーク」の曲調を形成する要素:
・アコースティックギターを中心とする生楽器のサウンド
・シンプルな楽器編成
・ゆったりしたテンポ
・親しみやすい曲構成
・身近だと感じられる内容を扱った歌詞

以下のルールに従い、3つの候補を提案してください。
・出力は JSON 配列で、各要素は "type" (track / artist / album / playlist) と "keyword" を持ちます。
・typeが"track"または"album"の場合、keywordには曲名(またはアルバム名)とアーティスト名を含めてください。
例: {"type": "track", "keyword": "曲名 アーティスト名"}
    {"type": "album", "keyword": "アルバム名 アーティスト名"}
必ずこの出力ルールにのっとり、余分な説明やテキストは一切含めずに出力してください。

入力: "${query}"
出力:[{"type": ..., "keyword": ...},
{"type": ..., "keyword": ...},
{"type": ..., "keyword": ...}]
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
            const validType = ["track", "artist", "album", "playlist"].includes(type)
                ? type
                : "playlist"; // groupなどをtrackにフォールバック
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
            const type = ["track", "artist", "album", "playlist"].includes(inference.type)
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
            }else if (type === "playlist") {
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
