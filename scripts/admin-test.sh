#!/bin/bash

# Admin API Test Script
# Usage: ./scripts/admin-test.sh [API_KEY]

# Get API key from argument or environment variable
API_KEY="${1:-${API_KEY}}"

# Check if API key is set
if [ -z "$API_KEY" ]; then
  echo "❌ Error: API key required"
  echo ""
  echo "Usage:"
  echo "  ./scripts/admin-test.sh YOUR_API_KEY"
  echo "  or"
  echo "  export API_KEY=your-key && ./scripts/admin-test.sh"
  echo ""
  exit 1
fi

# Base URL
BASE_URL="${API_BASE_URL:-http://localhost:3000}"

echo "🔑 Testing Admin API with key: ${API_KEY:0:8}..."
echo "🌐 Base URL: $BASE_URL"
echo ""

# Function to make authenticated requests
admin_request() {
  local method=$1
  local endpoint=$2
  local data=$3
  
  if [ -z "$data" ]; then
    curl -s -H "X-API-Key: $API_KEY" \
      -X "$method" \
      "$BASE_URL$endpoint"
  else
    curl -s -H "X-API-Key: $API_KEY" \
      -H "Content-Type: application/json" \
      -X "$method" \
      -d "$data" \
      "$BASE_URL$endpoint"
  fi
}

# Test 1: List subscriptions
echo "📋 Test 1: Listing all subscriptions..."
response=$(admin_request "GET" "/subscribe/requests")
echo "$response" | jq '.' 2>/dev/null || echo "$response"
echo ""

# Test 2: List scheduled jobs
echo "📅 Test 2: Listing scheduled jobs..."
response=$(admin_request "GET" "/scheduler/list")
echo "$response" | jq '.' 2>/dev/null || echo "$response"
echo ""

# Test 3: Health check (should work without key)
echo "💚 Test 3: Health check (public endpoint)..."
curl -s "$BASE_URL/health" | jq '.' 2>/dev/null || curl -s "$BASE_URL/health"
echo ""

echo "✅ Admin API tests complete!"
echo ""
echo "To test more operations:"
echo "  # Update subscription"
echo "  curl -X PUT -H \"X-API-Key: $API_KEY\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"status\": \"confirmed\"}' \\"
echo "    $BASE_URL/subscribe/request/SUBSCRIPTION_ID"
echo ""
echo "  # Delete subscription"
echo "  curl -X DELETE -H \"X-API-Key: $API_KEY\" \\"
echo "    $BASE_URL/subscribe/request/SUBSCRIPTION_ID"

