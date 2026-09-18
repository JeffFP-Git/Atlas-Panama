#!/bin/bash
# Kill API running via systemd

echo "🔍 Checking systemd services..."
echo ""

# List all panama/scraper related services
echo "📋 Panama/Scraper services:"
systemctl list-units --type=service --all | grep -E "panama|scraper|api" || echo "   (none found)"
echo ""

# Check status of the main service
if systemctl list-units --type=service --all | grep -q "panama-scraper"; then
    echo "📊 Service status:"
    systemctl status panama-scraper-main.service --no-pager -l || true
    echo ""
    
    read -p "⚠️  Stop panama-scraper-main.service? (y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🔄 Stopping service..."
        sudo systemctl stop panama-scraper-main.service
        sleep 1
        
        echo "📊 Service status after stop:"
        systemctl status panama-scraper-main.service --no-pager -l || true
        echo ""
        
        read -p "Disable service from starting on boot? (y/N) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo systemctl disable panama-scraper-main.service
            echo "✅ Service disabled"
        fi
    fi
fi

# Also check for any other related services
OTHER_SERVICES=$(systemctl list-units --type=service --all | grep -E "panama|scraper|api" | grep -v "panama-scraper-main" | awk '{print $1}')
if [ ! -z "$OTHER_SERVICES" ]; then
    echo ""
    echo "📋 Other related services found:"
    echo "$OTHER_SERVICES"
    echo ""
    read -p "Stop these services too? (y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "$OTHER_SERVICES" | while read svc; do
            echo "🔄 Stopping $svc..."
            sudo systemctl stop "$svc" 2>/dev/null || true
        done
    fi
fi

# Also kill the root scraper.js process if it's still running
SCRAPER_PID=$(ps aux | grep "node scraper.js" | grep -v grep | awk '{print $2}' | head -1)
if [ ! -z "$SCRAPER_PID" ]; then
    echo ""
    echo "🔍 Found scraper.js process (PID $SCRAPER_PID):"
    ps -p $SCRAPER_PID -o pid,ppid,user,cmd 2>/dev/null || ps aux | grep $SCRAPER_PID | grep -v grep
    echo ""
    read -p "⚠️  Kill this process? (y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🔄 Killing PID $SCRAPER_PID..."
        sudo kill -9 $SCRAPER_PID 2>/dev/null || kill -9 $SCRAPER_PID 2>/dev/null
        echo "✅ Killed"
    fi
fi

echo ""
echo "✅ Done"
