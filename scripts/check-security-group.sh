#!/bin/bash
# Check Security Group and network configuration

echo "🔒 Checking Security Group and Network Configuration"
echo "===================================================="
echo ""

# Get instance metadata
echo "1️⃣ EC2 Instance Metadata:"
echo "   Instance ID: $(curl -s --max-time 2 http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo 'N/A')"
echo "   Public IPv4: $(curl -s --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo 'NONE - Instance may not have public IP')"
echo "   Private IPv4: $(curl -s --max-time 2 http://169.254.169.254/latest/meta-data/local-ipv4 2>/dev/null || echo 'N/A')"
echo "   Public Hostname: $(curl -s --max-time 2 http://169.254.169.254/latest/meta-data/public-hostname 2>/dev/null || echo 'NONE')"
echo ""

# Check if we can get instance ID (to check Security Group via AWS CLI)
INSTANCE_ID=$(curl -s --max-time 2 http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null)

if [ ! -z "$INSTANCE_ID" ] && command -v aws >/dev/null 2>&1; then
  echo "2️⃣ Security Group Rules (via AWS CLI):"
  aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].SecurityGroups[*].[GroupId,GroupName]' --output table 2>/dev/null || echo "   ⚠️  AWS CLI not configured or no permissions"
  
  if [ $? -eq 0 ]; then
    SG_ID=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' --output text 2>/dev/null)
    if [ ! -z "$SG_ID" ]; then
      echo ""
      echo "   Inbound Rules for Security Group $SG_ID:"
      aws ec2 describe-security-groups --group-ids "$SG_ID" --query 'SecurityGroups[0].IpPermissions[*].[IpProtocol,FromPort,ToPort,IpRanges[0].CidrIp]' --output table 2>/dev/null
    fi
  fi
else
  echo "2️⃣ Security Group Check:"
  echo "   ⚠️  Cannot check Security Group automatically"
  echo "   💡 Check manually in AWS Console:"
  echo "      EC2 → Instances → Select instance → Security tab"
  echo "      Look for inbound rule allowing TCP port 3000"
fi
echo ""

# Check iptables INPUT chain specifically
echo "3️⃣ Checking iptables INPUT chain (affects incoming connections):"
INPUT_RULES=$(sudo iptables -L INPUT -n -v 2>/dev/null | head -20)
if [ ! -z "$INPUT_RULES" ]; then
  echo "$INPUT_RULES"
  if echo "$INPUT_RULES" | grep -q "3000\|REJECT\|DROP"; then
    echo ""
    echo "   ⚠️  Found rules that might block port 3000"
  else
    echo "   ✅ No obvious blocks for port 3000 in INPUT chain"
  fi
else
  echo "   ℹ️  Could not check iptables"
fi
echo ""

# Test from different perspectives
echo "4️⃣ Network Tests:"
echo "   Testing localhost..."
LOCAL_TEST=$(curl -s -w "\n%{http_code}" http://localhost:3000/health 2>&1)
if echo "$LOCAL_TEST" | tail -n1 | grep -q "200"; then
  echo "   ✅ Localhost works"
else
  echo "   ❌ Localhost failed"
fi

echo "   Testing 0.0.0.0..."
ZERO_TEST=$(curl -s -w "\n%{http_code}" http://0.0.0.0:3000/health 2>&1)
if echo "$ZERO_TEST" | tail -n1 | grep -q "200"; then
  echo "   ✅ 0.0.0.0 works"
else
  echo "   ❌ 0.0.0.0 failed"
fi

PRIVATE_IP=$(curl -s --max-time 2 http://169.254.169.254/latest/meta-data/local-ipv4 2>/dev/null)
if [ ! -z "$PRIVATE_IP" ]; then
  echo "   Testing private IP ($PRIVATE_IP)..."
  PRIVATE_TEST=$(curl -s -w "\n%{http_code}" http://$PRIVATE_IP:3000/health 2>&1)
  if echo "$PRIVATE_TEST" | tail -n1 | grep -q "200"; then
    echo "   ✅ Private IP works"
  else
    echo "   ❌ Private IP failed"
  fi
fi
echo ""

# Recommendations
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Recommendations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "If Public IP is NONE:"
echo "  1. Check AWS Console → EC2 → Your instance"
echo "  2. Ensure 'Auto-assign Public IP' is enabled"
echo "  3. Or use Elastic IP and assign it to the instance"
echo ""
echo "If Public IP exists but can't connect:"
echo "  1. Check Security Group inbound rules:"
echo "     - Type: Custom TCP"
echo "     - Port: 3000"
echo "     - Source: 0.0.0.0/0 (or your specific IP)"
echo ""
echo "  2. Check Network ACLs (subnet level):"
echo "     - VPC → Network ACLs → Select your subnet's ACL"
echo "     - Ensure inbound allows port 3000"
echo ""
echo "  3. Try adding iptables rule (temporary fix):"
echo "     sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT"
echo ""

