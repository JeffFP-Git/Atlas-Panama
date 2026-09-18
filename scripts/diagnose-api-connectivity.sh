#!/bin/bash
# Comprehensive API connectivity diagnosis

echo "🔍 Diagnosing API Connectivity Issues"
echo "======================================"
echo ""

# 1. Check if API process is running
echo "1️⃣ Checking if API process is running..."
API_PID=$(ps aux | grep -E "node.*api\.js" | grep -v grep | awk '{print $2}' | head -1)
if [ ! -z "$API_PID" ]; then
  echo "   ✅ API process found (PID: $API_PID)"
  ps aux | grep -E "node.*api\.js" | grep -v grep
else
  echo "   ❌ No API process found"
  echo "   💡 Start with: node api.js"
fi
echo ""

# 2. Check if port 3000 is listening
echo "2️⃣ Checking if port 3000 is listening..."
if command -v lsof >/dev/null 2>&1; then
  PORT_CHECK=$(sudo lsof -i :3000 2>/dev/null)
  if [ ! -z "$PORT_CHECK" ]; then
    echo "   ✅ Port 3000 is in use:"
    echo "$PORT_CHECK"
  else
    echo "   ❌ Port 3000 is not listening"
  fi
elif command -v ss >/dev/null 2>&1; then
  PORT_CHECK=$(sudo ss -tlnp | grep :3000)
  if [ ! -z "$PORT_CHECK" ]; then
    echo "   ✅ Port 3000 is listening:"
    echo "$PORT_CHECK"
  else
    echo "   ❌ Port 3000 is not listening"
  fi
else
  echo "   ⚠️  Cannot check port (lsof/ss not available)"
fi
echo ""

# 3. Check what interface it's binding to
echo "3️⃣ Checking API binding interface..."
if [ ! -z "$API_PID" ]; then
  NETSTAT=$(netstat -tlnp 2>/dev/null | grep :3000 || ss -tlnp 2>/dev/null | grep :3000)
  if echo "$NETSTAT" | grep -q "0.0.0.0:3000\|:::3000"; then
    echo "   ✅ API is binding to 0.0.0.0 (all interfaces) - Good!"
  elif echo "$NETSTAT" | grep -q "127.0.0.1:3000"; then
    echo "   ⚠️  API is only binding to localhost (127.0.0.1)"
    echo "   💡 This means it's only accessible from the EC2 instance itself"
    echo "   💡 Check api.js - should bind to 0.0.0.0 or process.env.PORT"
  else
    echo "   ❓ Could not determine binding"
  fi
fi
echo ""

# 4. Test local connectivity
echo "4️⃣ Testing local connectivity..."
LOCAL_TEST=$(curl -s -w "\n%{http_code}" http://localhost:3000/health 2>&1)
HTTP_CODE=$(echo "$LOCAL_TEST" | tail -n1)
BODY=$(echo "$LOCAL_TEST" | sed '$d')
if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Local connection works (HTTP $HTTP_CODE)"
  echo "   Response: $BODY"
else
  echo "   ❌ Local connection failed (HTTP $HTTP_CODE)"
  echo "   Response: $BODY"
fi
echo ""

# 5. Check EC2 instance metadata (public IP)
echo "5️⃣ Checking EC2 instance details..."
if curl -s --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 > /dev/null 2>&1; then
  PUBLIC_IP=$(curl -s --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4)
  echo "   Public IP: $PUBLIC_IP"
  
  # Test public IP connectivity
  echo "   Testing public IP connectivity..."
  PUBLIC_TEST=$(curl -s -w "\n%{http_code}" --max-time 5 http://$PUBLIC_IP:3000/health 2>&1)
  PUBLIC_HTTP=$(echo "$PUBLIC_TEST" | tail -n1)
  if [ "$PUBLIC_HTTP" = "200" ]; then
    echo "   ✅ Public IP connection works"
  else
    echo "   ❌ Public IP connection failed (HTTP $PUBLIC_HTTP)"
    echo "   This could be a Security Group or Network ACL issue"
  fi
else
  echo "   ⚠️  Could not retrieve EC2 metadata (might not be EC2)"
fi
echo ""

# 6. Check firewall (ufw)
echo "6️⃣ Checking firewall (ufw)..."
if command -v ufw >/dev/null 2>&1; then
  UFW_STATUS=$(sudo ufw status 2>/dev/null)
  if echo "$UFW_STATUS" | grep -q "Status: active"; then
    echo "   ⚠️  UFW is ACTIVE"
    echo "$UFW_STATUS" | head -10
    echo "   💡 Check if port 3000 is allowed: sudo ufw allow 3000"
  else
    echo "   ✅ UFW is inactive (not blocking)"
  fi
else
  echo "   ℹ️  UFW not installed"
fi
echo ""

# 7. Check iptables
echo "7️⃣ Checking iptables..."
if command -v iptables >/dev/null 2>&1; then
  IPTABLES_RULES=$(sudo iptables -L -n 2>/dev/null | grep -E "3000|REJECT|DROP" | head -5)
  if [ ! -z "$IPTABLES_RULES" ]; then
    echo "   ⚠️  Found iptables rules that might affect port 3000:"
    echo "$IPTABLES_RULES"
  else
    echo "   ✅ No obvious iptables rules blocking port 3000"
  fi
else
  echo "   ℹ️  iptables not available"
fi
echo ""

# 8. Check API logs for errors
echo "8️⃣ Recent API activity..."
echo "   Check the terminal where you ran 'node api.js' for errors"
echo "   Look for:"
echo "     - 'EADDRINUSE' (port already in use)"
echo "     - 'EACCES' (permission denied)"
echo "     - Connection errors"
echo ""

# 9. Summary and recommendations
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Summary & Recommendations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "If API is not accessible from outside EC2:"
echo "  1. Verify Security Group allows inbound on port 3000"
echo "  2. Check Network ACLs (subnet level)"
echo "  3. Ensure API binds to 0.0.0.0 (not 127.0.0.1)"
echo "  4. Check if ufw/iptables is blocking connections"
echo "  5. Verify API is actually running: ps aux | grep api.js"
echo ""
echo "Quick fixes to try:"
echo "  sudo ufw allow 3000"
echo "  sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT"
echo "  # Restart API: node api.js"
echo ""

