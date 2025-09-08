FROM node:22-alpine

WORKDIR /app

# package.json をコピーして依存をインストール
COPY package*.json ./

# devDependencies も含めてインストール
RUN npm install

# ソースコードをコピー
COPY . .

# TypeScript ビルド
RUN npm run build

# 常駐サーバーを起動
CMD ["node", "dist/server.js"]
