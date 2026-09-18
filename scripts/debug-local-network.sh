#!/bin/bash
# Debug local network/firewall issues connecting to EC2 API

EC2_IP="${1:-18.189.116.22}"
PORT="${2:-3000}"

echo "🔍 Debugging Local Network Connection to EC2"
echo "============================================="
echo ""
echo "Target: $EC2_IP:$PORT"
echo ""

# 1. Test basic connectivity
echo "1️⃣ Testing Basic Connectivity..."
echo "   Pinging EC2 instance..."
if ping -c 3 $EC2_IP > /dev/null 2>&1; then
  echo "   ✅ Ping successful"
else
  echo "   ⚠️  Ping failed (ICMP might be blocked, but TCP could still work)"
fi
echo ""

# 2. Test DNS resolution
echo "2️⃣ Testing DNS Resolution..."
if nslookup $EC2_IP > /dev/null 2>&1; then
  echo "   ✅ DNS resolution works"
else
  echo "   ⚠️  DNS lookup failed (but IP is direct, so this is OK)"
fi
echo ""

# 3. Test port connectivity with telnet/nc
echo "3️⃣ Testing Port Connectivity..."
if command -v nc >/dev/null 2>&1; then
  echo "   Testing with netcat (nc)..."
  if timeout 5 nc -zv $EC2_IP $PORT 2>&1 | grep -q "succeeded\|open"; then
    echo "   ✅ Port $PORT is reachable"
  else
    echo "   ❌ Port $PORT is NOT reachable"
    echo "   This suggests a firewall/network block"
  fi
elif command -v telnet >/dev/null 2>&1; then
  echo "   Testing with telnet..."
  timeout 3 telnet $EC2_IP $PORT 2>&1 | head -3
else
  echo "   ⚠️  nc or telnet not available, skipping port test"
fi
echo ""

# 4. Test with curl verbose
echo "4️⃣ Testing with curl (verbose)..."
echo "   Running: curl -v --connect-timeout 10 http://$EC2_IP:$PORT/health"
echo ""
curl -v --connect-timeout 10 http://$EC2_IP:$PORT/health 2>&1 | head -30
echo ""

# 5. Check local firewall (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "5️⃣ Checking macOS Firewall..."
  FIREWALL_STATUS=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null | grep -i "enabled\|disabled")
  if [ ! -z "$FIREWALL_STATUS" ]; then
    echo "   Firewall status: $FIREWALL_STATUS"
    if echo "$FIREWALL_STATUS" | grep -qi "enabled"; then
      echo "   ⚠️  macOS Firewall is enabled"
      echo "   💡 Try: System Settings → Network → Firewall → Turn Off (temporarily)"
    else
      echo "   ✅ macOS Firewall is disabled"
    fi
  else
    echo "   ℹ️  Could not check firewall status"
  fi
  echo ""
fi

# 6. Check for proxy settings
echo "6️⃣ Checking Proxy Settings..."
if [ ! -z "$http_proxy" ] || [ ! -z "$HTTP_PROXY" ]; then
  echo "   ⚠️  HTTP_PROXY is set: ${http_proxy:-$HTTP_PROXY}"
  echo "   💡 Try: unset http_proxy HTTP_PROXY && curl http://$EC2_IP:$PORT/health"
else
  echo "   ✅ No proxy configured"
fi
echo ""

# 7. Test from different network (suggestion)
echo "7️⃣ Network Isolation Test..."
echo "   💡 Try testing from:"
echo "      - Mobile hotspot (different network)"
echo "      - Different computer on same network"
echo "      - VPN (if you're using one)"
echo ""

# 8. Check router/firewall
echo "8️⃣ Router/Network Firewall Check..."
echo "   💡 If you're on a corporate/work network:"
echo "      - Corporate firewalls often block outbound connections"
echo "      - Try from home network or mobile hotspot"
echo "   💡 If you're on home network:"
echo "      - Check router firewall settings"
echo "      - Some ISPs block certain ports"
echo ""

# 9. Test with different tool
echo "9️⃣ Alternative Test Methods..."
echo "   Try with wget:"
echo "   wget -O- --timeout=10 http://$EC2_IP:$PORT/health"
echo ""
echo "   Try with Python:"
echo "   python3 -c \"import urllib.request; print(urllib.request.urlopen('http://$EC2_IP:$PORT/health').read())\""
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "If port test fails but ping works:"
echo "  → Likely a firewall blocking outbound TCP connections"
echo ""
echo "If curl shows 'Connection reset by peer':"
echo "  → Connection reaches server but is immediately closed"
echo "  → Could be: local firewall, ISP blocking, or server-side issue"
echo ""
echo "If curl shows 'Connection timed out':"
echo "  → Connection never reaches server"
echo "  → Likely: firewall, network routing, or Security Group"
echo ""

