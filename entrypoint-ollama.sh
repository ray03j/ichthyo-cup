#!/bin/sh
# Ollama サーバーをバックグラウンドで起動
ollama serve &

# サーバーが起動するまで少し待つ
sleep 5

# 必要なモデルを pull
ollama pull qwen2.5-coder:7b

# サーバーをフォアグラウンドで維持
wait
