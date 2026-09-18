#!/bin/bash
# Aggressively find and kill the API process

echo "🔍 Finding API process..."
echo ""

# Check screen sessions first
SCREEN_SESSIONS=$(screen -ls | grep -oP '\d+\.\w+' | head -1)
if [ ! -z "$SCREEN_SESSIONS" ]; then
    echo "📺 Found screen sessions:"
    screen -ls
    echo ""
    read -p "Kill all screen sessions? (y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        screen -ls | grep Detached | cut -d. -f1 | awk '{print $1}' | xargs -I {} screen -S {} -X quit 2>/dev/null
        screen -ls | grep Attached | cut -d. -f1 | awk '{print $1}' | xargs -I {} screen -S {} -X quit 2>/dev/null
        echo "✅ Screen sessions killed"
    fi
fi

# Find process on port 3000 (with sudo)
PID=$(sudo lsof -ti :3000 2>/dev/null)
if [ -z "$PID" ]; then
    PID=$(sudo ss -tlnp | grep :3000 | grep -oP 'pid=\K[0-9]+' | head -1)
fi

# Also check for node api.js processes
NODE_PIDS=$(ps aux | grep -E "node.*api\.js" | grep -v grep | awk '{print $2}')

if [ ! -z "$PID" ]; then
    echo "✅ Found process on port 3000: PID $PID"
    ps -p $PID -o pid,ppid,cmd 2>/dev/null || ps aux | grep $PID | grep -v grep
    echo ""
    echo "🔄 Killing PID $PID..."
    sudo kill -9 $PID 2>/dev/null || kill -9 $PID 2>/dev/null
    echo "✅ Killed"
fi

if [ ! -z "$NODE_PIDS" ]; then
    echo ""
    echo "✅ Found node api.js processes:"
    ps aux | grep -E "node.*api\.js" | grep -v grep
    echo ""
    echo "$NODE_PIDS" | while read npid; do
        if [ ! -z "$npid" ]; then
            echo "🔄 Killing node process PID $npid..."
            sudo kill -9 $npid 2>/dev/null || kill -9 $npid 2>/dev/null
        fi
    done
    echo "✅ Killed all node api.js processes"
fi

if [ -z "$PID" ] && [ -z "$NODE_PIDS" ]; then
    echo "❌ No API process found"
    echo ""
    echo "💡 Run ./find-api-process.sh for more details"
fi

echo ""
echo "🔍 Verifying port 3000 is free..."
sleep 1
if sudo lsof -ti :3000 > /dev/null 2>&1; then
    echo "⚠️  Port 3000 still in use!"
    sudo lsof -i :3000
else
    echo "✅ Port 3000 is now free"
fi
