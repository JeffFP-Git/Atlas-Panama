#!/bin/bash
# Check for docker containers running scrapers

echo "🐳 Checking Docker containers..."
echo ""

echo "1️⃣ Running containers:"
docker ps | grep -E "panama|scraper|main" || echo "   (no matching containers)"
echo ""

echo "2️⃣ All containers (including stopped):"
docker ps -a | grep -E "panama|scraper|main" || echo "   (no matching containers)"
echo ""

echo "3️⃣ Docker Compose services:"
if [ -f "docker-compose.yml" ]; then
  docker-compose ps 2>/dev/null || echo "   (docker-compose not available or no services)"
else
  echo "   (docker-compose.yml not found)"
fi
echo ""

echo "4️⃣ Scheduled jobs via API:"
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

if [ ! -z "$API_KEY" ]; then
  curl -s -H "X-API-Key: $API_KEY" http://localhost:3000/scheduler/list 2>/dev/null | jq '.' || echo "   (API not responding)"
else
  echo "   (API_KEY not set)"
fi
echo ""

echo "5️⃣ Node processes:"
ps aux | grep -E "node.*scraper|node.*api" | grep -v grep || echo "   (no matching processes)"
echo ""

