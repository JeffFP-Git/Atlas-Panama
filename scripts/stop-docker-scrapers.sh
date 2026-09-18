#!/bin/bash
# Stop all docker containers and scheduled jobs

echo "🛑 Stopping all scraper processes..."
echo ""

# Load API key
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

# 1. Stop docker-compose services
echo "1️⃣ Stopping docker-compose services..."
if [ -f "docker-compose.yml" ]; then
  docker-compose down 2>/dev/null || echo "   (docker-compose down failed or not needed)"
  docker-compose stop 2>/dev/null || echo "   (docker-compose stop failed or not needed)"
  echo "   ✅ Docker compose stopped"
else
  echo "   (docker-compose.yml not found)"
fi
echo ""

# 2. Stop docker containers
echo "2️⃣ Stopping docker containers..."
CONTAINERS=$(docker ps -q --filter "name=panama" --filter "name=scraper" --filter "name=main" 2>/dev/null)
if [ ! -z "$CONTAINERS" ]; then
  echo "$CONTAINERS" | while read container; do
    if [ ! -z "$container" ]; then
      echo "   Stopping container: $container"
      docker stop "$container" 2>/dev/null || true
    fi
  done
  echo "   ✅ Docker containers stopped"
else
  echo "   (no matching containers found)"
fi
echo ""

# 3. Stop scheduled jobs via API
echo "3️⃣ Stopping scheduled jobs via API..."
if [ ! -z "$API_KEY" ]; then
  JOBS=$(curl -s -H "X-API-Key: $API_KEY" http://localhost:3000/scheduler/list 2>/dev/null | jq -r '.jobs[].jobId' 2>/dev/null)
  if [ ! -z "$JOBS" ]; then
    echo "$JOBS" | while read job_id; do
      if [ ! -z "$job_id" ]; then
        echo "   Stopping job: $job_id"
        curl -s -X DELETE -H "X-API-Key: $API_KEY" "http://localhost:3000/scheduler/$job_id" > /dev/null 2>&1 || true
      fi
    done
    echo "   ✅ Scheduled jobs stopped"
  else
    echo "   (no scheduled jobs found)"
  fi
else
  echo "   (API_KEY not set, skipping API jobs)"
fi
echo ""

# 4. Kill node processes
echo "4️⃣ Killing node scraper processes..."
SCRAPER_PIDS=$(ps aux | grep -E "node.*scraper\.js" | grep -v grep | awk '{print $2}')
if [ ! -z "$SCRAPER_PIDS" ]; then
  echo "$SCRAPER_PIDS" | while read pid; do
    if [ ! -z "$pid" ]; then
      echo "   Killing PID $pid..."
      sudo kill -9 $pid 2>/dev/null || kill -9 $pid 2>/dev/null || true
    fi
  done
  echo "   ✅ Node processes killed"
else
  echo "   (no scraper.js processes found)"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All scrapers stopped"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
