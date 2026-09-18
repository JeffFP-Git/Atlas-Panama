#!/bin/bash
# Verify that subscriptions persist across API restarts

API_URL="${API_URL:-http://localhost:3000}"
DATA_FILE="data/intro-requests.json"

echo "🔍 Verifying Subscription Persistence"
echo "===================================="
echo ""

# Check if data file exists
if [ ! -f "$DATA_FILE" ]; then
  echo "⚠️  Data file not found: $DATA_FILE"
  echo "   Creating empty data structure..."
  mkdir -p data
  echo '{"requests": [], "subscriptions": []}' > "$DATA_FILE"
fi

echo "✅ Data file exists: $DATA_FILE"
echo ""

# Count subscriptions in file
SUBS_IN_FILE=$(jq '.subscriptions | length' "$DATA_FILE" 2>/dev/null || echo "0")
CONFIRMED_IN_FILE=$(jq '[.subscriptions[] | select(.confirmed == true and .status == "confirmed")] | length' "$DATA_FILE" 2>/dev/null || echo "0")

echo "📊 Current state:"
echo "   Total subscriptions in file: $SUBS_IN_FILE"
echo "   Confirmed subscriptions in file: $CONFIRMED_IN_FILE"
echo ""

# Check API is running
if ! curl -s "$API_URL/health" > /dev/null 2>&1; then
  echo "❌ API is not running at $API_URL"
  echo "   Start the API first: node api.js"
  exit 1
fi

echo "✅ API is running"
echo ""

# Get scheduled jobs from API
echo "📋 Scheduled jobs from API:"
API_JOBS=$(curl -s "$API_URL/scheduler/list" | jq -r '.jobs | length' 2>/dev/null || echo "0")
echo "   Active scheduled jobs: $API_JOBS"
echo ""

# Get subscriptions from API
echo "📋 Subscriptions from API:"
API_SUBS=$(curl -s "$API_URL/subscribe/requests" | jq -r '.requests | length' 2>/dev/null || echo "0")
API_CONFIRMED=$(curl -s "$API_URL/subscribe/requests?confirmed=true" | jq -r '.requests | length' 2>/dev/null || echo "0")
echo "   Total subscriptions: $API_SUBS"
echo "   Confirmed subscriptions: $API_CONFIRMED"
echo ""

# Compare
if [ "$CONFIRMED_IN_FILE" -eq "$API_JOBS" ]; then
  echo "✅ MATCH: Confirmed subscriptions match scheduled jobs"
else
  echo "⚠️  MISMATCH: Confirmed subscriptions ($CONFIRMED_IN_FILE) != Scheduled jobs ($API_JOBS)"
  echo "   This might be normal if some subscriptions aren't confirmed yet"
fi

echo ""
echo "📝 Data file location: $(pwd)/$DATA_FILE"
echo "   Make sure this is on persistent storage (EBS volume) on EC2!"
echo ""

# Check if on EBS or ephemeral (Linux only)
if [ -f /proc/mounts ]; then
  MOUNT_POINT=$(df "$(pwd)" | tail -1 | awk '{print $1}')
  echo "💾 Storage info:"
  echo "   Mount point: $MOUNT_POINT"
  if [[ "$MOUNT_POINT" == *"nvme"* ]] || [[ "$MOUNT_POINT" == *"xvd"* ]]; then
    echo "   ✅ Appears to be on EBS volume (good for persistence)"
  else
    echo "   ⚠️  May be on instance store (ephemeral - data lost on stop)"
  fi
fi

echo ""
echo "🧪 To test persistence:"
echo "   1. Create a subscription and confirm it"
echo "   2. Verify it's scheduled: curl $API_URL/scheduler/list | jq"
echo "   3. Kill the API: pkill -f 'node.*api.js'"
echo "   4. Restart the API: node api.js"
echo "   5. Check logs for: 'Loaded X confirmed subscriptions for daily scheduling'"
echo "   6. Verify it's still scheduled: curl $API_URL/scheduler/list | jq"


