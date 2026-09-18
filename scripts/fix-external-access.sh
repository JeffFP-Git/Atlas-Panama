#!/bin/bash
# Fix external access to API

echo "🔧 Fixing External API Access"
echo "=============================="
echo ""

# Get public IP
PUBLIC_IP=$(curl -s --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null)
if [ -z "$PUBLIC_IP" ]; then
  echo "⚠️  No public IP found. Make sure Elastic IP is associated."
  echo "   Check AWS Console: EC2 → Elastic IPs → Associate"
  exit 1
fi

echo "✅ Public IP: $PUBLIC_IP"
echo ""

# Check if API is running locally
echo "1️⃣ Testing local API..."
LOCAL_TEST=$(curl -s -w "\n%{http_code}" http://localhost:3000/health 2>&1)
HTTP_CODE=$(echo "$LOCAL_TEST" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Local API works"
else
  echo "   ❌ Local API not working - start it first: node api.js"
  exit 1
fi
echo ""

# Check iptables
echo "2️⃣ Checking iptables INPUT chain..."
IPTABLES_RULE=$(sudo iptables -L INPUT -n | grep -E "3000|ACCEPT.*tcp.*3000")
if [ -z "$IPTABLES_RULE" ]; then
  echo "   ⚠️  No iptables rule for port 3000"
  echo "   Adding rule..."
  sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT
  echo "   ✅ Rule added"
else
  echo "   ✅ iptables rule exists"
fi
echo ""

# Test from public IP (from within EC2)
echo "3️⃣ Testing from public IP (from EC2)..."
PUBLIC_TEST=$(curl -s -w "\n%{http_code}" --max-time 5 http://$PUBLIC_IP:3000/health 2>&1)
PUBLIC_HTTP=$(echo "$PUBLIC_TEST" | tail -n1)
if [ "$PUBLIC_HTTP" = "200" ]; then
  echo "   ✅ Public IP works from EC2"
else
  echo "   ❌ Public IP failed from EC2 (HTTP $PUBLIC_HTTP)"
  echo "   This might be a Security Group issue"
fi
echo ""

# Instructions
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Next Steps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Verify Security Group in AWS Console:"
echo "   EC2 → Instances → Select instance → Security tab"
echo "   → Click Security Group → Edit inbound rules"
echo ""
echo "   Add rule if missing:"
echo "   - Type: Custom TCP"
echo "   - Port: 3000"
echo "   - Source: 0.0.0.0/0 (or your IP for security)"
echo "   - Description: API access"
echo ""
echo "2. Test from your local machine:"
echo "   curl http://$PUBLIC_IP:3000/health"
echo ""
echo "3. If still not working, check Network ACLs:"
echo "   VPC → Network ACLs → Select your subnet's ACL"
echo "   Ensure inbound allows port 3000"
echo ""

