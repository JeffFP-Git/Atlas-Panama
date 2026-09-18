#!/bin/bash
# Stop all scraper processes and scheduled jobs

echo "🛑 Stopping all scraper processes..."
echo ""

# Load API key if available
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

# 1. Stop systemd services
echo "1️⃣ Stopping systemd services..."
SERVICES=$(systemctl list-units --type=service --all | grep -E "panama|scraper" | awk '{print $1}')
if [ ! -z "$SERVICES" ]; then
  echo "$SERVICES" | while read svc; do
    if [ ! -z "$svc" ]; then
      echo "   Stopping $svc..."
      sudo systemctl stop "$svc" 2>/dev/null || true
      sudo systemctl disable "$svc" 2>/dev/null || true
    fi
  done
  echo "   ✅ Systemd services stopped"
else
  echo "   (no systemd services found)"
fi
echo ""

# 2. Kill scraper.js processes
echo "2️⃣ Killing scraper.js processes..."
SCRAPER_PIDS=$(ps aux | grep -E "node.*scraper\.js" | grep -v grep | awk '{print $2}')
if [ ! -z "$SCRAPER_PIDS" ]; then
  echo "$SCRAPER_PIDS" | while read pid; do
    if [ ! -z "$pid" ]; then
      echo "   Killing PID $pid..."
      sudo kill -9 $pid 2>/dev/null || kill -9 $pid 2>/dev/null || true
    fi
  done
  echo "   ✅ Scraper processes killed"
else
  echo "   (no scraper.js processes found)"
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
    echo "   (no scheduled jobs found or API not responding)"
  fi
else
  echo "   (API_KEY not set, skipping API jobs)"
fi
echo ""

# 4. Kill screen sessions
echo "4️⃣ Killing screen sessions..."
screen -ls | grep -oP '\d+\.\w+' | while read session; do
  if [ ! -z "$session" ]; then
    echo "   Killing screen session: $session"
    screen -S "$session" -X quit 2>/dev/null || true
  fi
done
echo "   ✅ Screen sessions killed"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All scrapers stopped"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Verify with: ./scripts/find-all-scrapers.sh"

