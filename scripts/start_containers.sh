#!/usr/bin/env bash
set -e

echo "Starting 5-container Todo Application on AWS EC2..."
cd /home/ubuntu/ngtc-assessment

# Ensure .env exists
if [ ! -f .env ]; then
    cp .env.example .env
fi

# Build and start all 5 containers in detached mode
docker compose up -d --build

echo "Containers started successfully:"
docker compose ps

