#!/bin/bash
# Test API endpoints from within EC2 instance
# Usage: ./scripts/test-api-ec2.sh

BASE_URL="${API_BASE_URL:-http://localhost:3000}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🧪 Testing API endpoints on EC2"
echo "Base URL: $BASE_URL"
echo ""

# Load API key from .env if it exists
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

API_KEY="${API_KEY:-}"

# Test function
test_endpoint() {
  local method=$1
  local endpoint=$2
  local description=$3
  local data=$4
  local requires_auth=$5
  
  echo -e "${YELLOW}Testing:${NC} $description"
  echo "  $method $endpoint"
  
  if [ "$requires_auth" = "true" ] && [ -z "$API_KEY" ]; then
    echo -e "  ${RED}⚠️  Skipping (API_KEY not set)${NC}"
    echo ""
    return
  fi
  
  if [ "$method" = "GET" ]; then
    if [ "$requires_auth" = "true" ]; then
      response=$(curl -s -w "\n%{http_code}" -H "X-API-Key: $API_KEY" "$BASE_URL$endpoint")
    else
      response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
    fi
  elif [ "$method" = "POST" ] || [ "$method" = "PUT" ] || [ "$method" = "DELETE" ]; then
    if [ "$requires_auth" = "true" ]; then
      if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" -d "$data" "$BASE_URL$endpoint")
      else
        response=$(curl -s -w "\n%{http_code}" -X "$method" -H "X-API-Key: $API_KEY" "$BASE_URL$endpoint")
      fi
    else
      if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint")
      else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint")
      fi
    fi
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo -e "  ${GREEN}✅ Success (HTTP $http_code)${NC}"
    echo "$body" | jq '.' 2>/dev/null || echo "$body" | head -5
  else
    echo -e "  ${RED}❌ Failed (HTTP $http_code)${NC}"
    echo "$body" | head -3
  fi
  echo ""
}

# ===== PUBLIC ENDPOINTS (No API Key Required) =====
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 PUBLIC ENDPOINTS (No Authentication Required)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_endpoint "GET" "/health" "Health Check" "" "false"

test_endpoint "POST" "/subscribe/submit" "Submit Subscription" '{
  "email": "test@example.com",
  "tipo": "mercantil",
  "nameOrFolio": "Test Company",
  "folio": null,
  "codigo": null
}' "false"

# Note: These require a real subscription ID and token
# test_endpoint "GET" "/subscribe/request/SUBSCRIPTION_ID?token=TOKEN" "Get Subscription (with token)" "" "false"
# test_endpoint "GET" "/subscribe/request/SUBSCRIPTION_ID/confirm?token=TOKEN" "Confirm Subscription (GET)" "" "false"
# test_endpoint "POST" "/subscribe/request/SUBSCRIPTION_ID/confirm" "Confirm Subscription (POST)" '{"token": "TOKEN"}' "false"

test_endpoint "GET" "/intro/requests" "List Intro Requests" "" "false"

test_endpoint "POST" "/intro/submit" "Submit Intro Request" '{
  "type": "finca",
  "businessName": "Test Business",
  "propertyName": "Test Property",
  "email": "test@example.com"
}' "false"

# ===== ADMIN ENDPOINTS (API Key Required) =====
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 ADMIN ENDPOINTS (API Key Required)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -z "$API_KEY" ]; then
  echo -e "${YELLOW}⚠️  API_KEY not set in .env - skipping admin endpoints${NC}"
  echo "   Set API_KEY in .env file to test admin endpoints"
  echo ""
else
  echo -e "${GREEN}Using API Key: ${API_KEY:0:8}...${NC}"
  echo ""
fi

test_endpoint "GET" "/subscribe/requests" "List All Subscriptions" "" "true"

test_endpoint "GET" "/scheduler/list" "List Scheduled Jobs" "" "true"

test_endpoint "GET" "/jobs" "List All Jobs" "" "true"

test_endpoint "GET" "/files" "List Files" "" "true"

# Note: These require real IDs
# test_endpoint "GET" "/jobs/JOB_ID" "Get Job Status" "" "true"
# test_endpoint "DELETE" "/scheduler/SUBSCRIPTION_ID" "Remove Scheduled Job" "" "true"
# test_endpoint "POST" "/scheduler/test" "Schedule Test Job" '{"subscriptionId": "ID", "delaySeconds": 20}' "true"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Testing complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Tips:"
echo "  - Use ./scripts/admin.sh for easier admin operations"
echo "  - Check API logs for detailed request/response info"
echo "  - Use jq to format JSON responses: curl ... | jq"

