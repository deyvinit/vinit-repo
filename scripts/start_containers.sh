#!/usr/bin/env bash
set -e

echo "Starting 5-container Todo Application on AWS EC2..."
cd /home/ubuntu/ngtc-assessment

# Ensure .env exists
if [ ! -f .env ]; then
    cp .env.example .env
fi

# Ensure docker socket permissions
sudo chmod 666 /var/run/docker.sock 2>/dev/null || true

# Stop/remove any existing containers by name just in case
docker stop todo-frontend todo-middleware todo-rust-api todo-auth todo-db 2>/dev/null || true
docker rm todo-frontend todo-middleware todo-rust-api todo-auth todo-db 2>/dev/null || true

# Build and start all 5 containers in detached mode
docker compose up -d --build

echo "Containers started successfully:"
docker compose ps

