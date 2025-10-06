# MusiChat

Spotify API を利用して、24時間音楽を検索・再生できるアプリ
([https://topaz.dev/projects/caef3ce6d55469fa9707](https://topaz.dev/projects/caef3ce6d55469fa9707))

## 特徴

* Spotify API で音楽を検索・再生
* リアルタイムでの音楽探索が可能
* Ollama や Brave API と統合した高度な検索機能

## 必要な環境

* Node.js（推奨バージョン：18.x 以上）
* Docker（Ollama をコンテナで起動する場合は必須）

---

## インストールとセットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/ray03j/ichthyo-cup.git
cd ichthyo-cup
```

### 2. 依存関係をインストール

```bash
npm install
```

### 3. 環境変数の設定

API キーやモデル設定などは `.env` ファイルで管理します。まずはサンプルをコピーして `.env` を作成してください。

```bash
cp .env.sample .env
```

`.env` の内容例：

```env
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://127.0.0.1:4000/api/auth/callback
OLLAMA_MODEL=qwen2.5-coder:7b
OLLAMA_HOST=http://ollama:11434
BRAVE_API_KEY=
GPU_COUNT=1 # 0ならGPU割り当てなし
```

* **SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET**: Spotify API のクライアント情報
* **SPOTIFY_REDIRECT_URI**: 認証後のリダイレクト URL
* **OLLAMA_MODEL / OLLAMA_HOST**: Ollama モデルとホスト設定
* **BRAVE_API_KEY**: Brave Search API キー
* **GPU_COUNT**: 使用する GPU 数（0 にすると GPU 割り当てなし）

> `.env` は秘密情報を含むため、絶対にリポジトリにコミットしないでください。

---

### 4. Docker で Ollama とサーバーを起動（推奨）

```bash
docker compose up --build
```

* Ollama サーバー（GPU 対応）と MCP サーバーが起動します
* `http://localhost:4000` でアクセス可能
* ローカルに Ollama を直接インストールしている場合は、ポート競合に注意（`OLLAMA_HOST` を適宜変更）

### 5. Docker を使わずに開発する場合

```bash
# MCP サーバー単体起動
npm run build
npm start

# 開発中は ts-node でも実行可能
npx ts-node src/server.ts
```

> Ollama サーバーは別途ローカル環境で起動しておく必要があります。

---

## 使用技術

* フロントエンド：React, TypeScript ([フロントエンドリポジトリ](https://github.com/Utakata1024/ichthyo-cup-frontend))
* バックエンド：Node.js, Express
* API 統合：Spotify, Ollama, Brave API

---

## 貢献方法

1. リポジトリをフォーク
2. 新しいブランチを作成

```bash
git checkout -b feature/your-feature
```

3. 変更を加え、コミット

```bash
git commit -m "Add new feature"
```

4. プッシュ

```bash
git push origin feature/your-feature
```

5. プルリクエストを作成して変更内容を提案
