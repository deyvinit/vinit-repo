#!/usr/bin/env bash

echo "Stopping containers if running..."
cd /home/ubuntu/ngtc-assessment || exit 0

if command -v docker &> /dev/null; then
    docker compose down || true
fi

