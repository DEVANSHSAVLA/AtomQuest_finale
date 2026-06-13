#!/bin/sh

echo "=== Starting SupportStream Services ==="

# 1. Start Mediasoup Media Server in the background
echo "Starting Mediasoup Media Server on local port 3002..."
node /app/services/media-server/dist/index.js &

# 2. Start NestJS API Server in the foreground (exposing port 7860)
echo "Starting NestJS API Server on port 7860..."
node /app/apps/api/dist/src/main.js
