#!/bin/bash
# Find the API process that's running

echo "🔍 Searching for API process..."
echo ""

echo "1️⃣ Checking screen sessions:"
screen -ls
echo ""

echo "2️⃣ Checking all node processes:"
ps aux | grep -E "node|api\.js" | grep -v grep
echo ""

echo "3️⃣ Checking processes listening on port 3000 (all methods):"
echo "   Using lsof:"
sudo lsof -i :3000 2>/dev/null || echo "   (lsof not available or no process found)"
echo ""

echo "   Using ss:"
sudo ss -tlnp | grep :3000 || echo "   (no process found)"
echo ""

echo "4️⃣ Checking for PM2 processes:"
pm2 list 2>/dev/null || echo "   (PM2 not installed or no processes)"
echo ""

echo "5️⃣ Checking systemd services:"
systemctl list-units --type=service | grep -E "panama|scraper|api" || echo "   (no matching services)"
echo ""

echo "6️⃣ Checking all processes by all users on port 3000:"
sudo netstat -tlnp 2>/dev/null | grep :3000 || sudo ss -tlnp | grep :3000 || echo "   (no process found)"
