#!/usr/bin/env bash

echo "Stopping containers if running..."
cd /home/ubuntu/ngtc-assessment || exit 0

if command -v docker &> /dev/null; then
    docker compose down || true
    docker stop todo-frontend todo-middleware todo-rust-api todo-auth todo-db 2>/dev/null || true
    docker rm todo-frontend todo-middleware todo-rust-api todo-auth todo-db 2>/dev/null || true
fi

