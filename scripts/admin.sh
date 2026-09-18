#!/bin/bash

# Admin API Helper Script
# Reads API_KEY from .env file automatically
# Usage: ./scripts/admin.sh [command] [args...]

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env file
if [ -f "$PROJECT_ROOT/.env" ]; then
  # Export variables from .env (handles comments and empty lines)
  export $(grep -v '^#' "$PROJECT_ROOT/.env" | grep -v '^$' | xargs)
else
  echo "❌ Error: .env file not found at $PROJECT_ROOT/.env"
  exit 1
fi

# Check if API_KEY is set
if [ -z "$API_KEY" ]; then
  echo "❌ Error: API_KEY not found in .env file"
  echo ""
  echo "Add this to your .env file:"
  echo "  API_KEY=your-api-key-here"
  exit 1
fi

# Base URL
BASE_URL="${API_BASE_URL:-${FRONTEND_URL:-http://localhost:3000}}"

# Function to make authenticated requests
admin_request() {
  local method=$1
  local endpoint=$2
  local data=$3
  
  # Check if API is running
  if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo "❌ Error: API is not running at $BASE_URL"
    echo "   Start the API with: node api.js"
    return 1
  fi
  
  if [ -z "$data" ]; then
    curl -s -w "\n%{http_code}" -H "X-API-Key: $API_KEY" \
      -X "$method" \
      "$BASE_URL$endpoint"
  else
    curl -s -w "\n%{http_code}" -H "X-API-Key: $API_KEY" \
      -H "Content-Type: application/json" \
      -X "$method" \
      -d "$data" \
      "$BASE_URL$endpoint"
  fi
}

# Parse command
COMMAND="${1:-help}"

case "$COMMAND" in
  list|ls)
    echo "📋 Listing all subscriptions..."
    admin_request "GET" "/subscribe/requests" | jq '.' 2>/dev/null || admin_request "GET" "/subscribe/requests"
    ;;
    
  jobs|scheduler)
    echo "📅 Listing scheduled jobs..."
    admin_request "GET" "/scheduler/list" | jq '.' 2>/dev/null || admin_request "GET" "/scheduler/list"
    ;;
    
  get)
    if [ -z "$2" ]; then
      echo "❌ Error: Subscription ID required"
      echo "Usage: ./scripts/admin.sh get SUBSCRIPTION_ID"
      exit 1
    fi
    echo "🔍 Getting subscription: $2"
    admin_request "GET" "/subscribe/requests?email=$2" | jq '.' 2>/dev/null || admin_request "GET" "/subscribe/requests?email=$2"
    ;;
    
  update|put)
    if [ -z "$2" ] || [ -z "$3" ]; then
      echo "❌ Error: Subscription ID and JSON data required"
      echo "Usage: ./scripts/admin.sh update SUBSCRIPTION_ID '{\"status\":\"confirmed\"}'"
      exit 1
    fi
    echo "✏️  Updating subscription: $2"
    admin_request "PUT" "/subscribe/request/$2" "$3" | jq '.' 2>/dev/null || admin_request "PUT" "/subscribe/request/$2" "$3"
    ;;
    
  delete|rm)
    if [ -z "$2" ]; then
      echo "❌ Error: Subscription ID required"
      echo "Usage: ./scripts/admin.sh delete SUBSCRIPTION_ID"
      exit 1
    fi
    echo "🗑️  Deleting subscription: $2"
    admin_request "DELETE" "/subscribe/request/$2" | jq '.' 2>/dev/null || admin_request "DELETE" "/subscribe/request/$2"
    ;;
    
  test)
    if [ -z "$2" ] || [ -z "$3" ]; then
      echo "❌ Error: Subscription ID and delay seconds required"
      echo "Usage: ./scripts/admin.sh test SUBSCRIPTION_ID 20"
      exit 1
    fi
    echo "🧪 Scheduling test job for subscription: $2"
    admin_request "POST" "/scheduler/test" "{\"subscriptionId\":\"$2\",\"delaySeconds\":$3}" | jq '.' 2>/dev/null || admin_request "POST" "/scheduler/test" "{\"subscriptionId\":\"$2\",\"delaySeconds\":$3}"
    ;;
    
  stop-job|stop)
    if [ -z "$2" ]; then
      echo "❌ Error: Job/Subscription ID required"
      echo "Usage: ./scripts/admin.sh stop-job JOB_ID"
      exit 1
    fi
    echo "⏹️  Stopping job: $2"
    admin_request "DELETE" "/scheduler/$2" | jq '.' 2>/dev/null || admin_request "DELETE" "/scheduler/$2"
    ;;
    
  end-all|stop-all)
    echo "🛑 Ending all subscriptions..."
    read -p "⚠️  This will stop all scheduled jobs and cancel all subscriptions. Continue? (y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      # Check if API is running first
      if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
        echo "❌ Error: API is not running at $BASE_URL"
        echo "   Start the API with: node api.js"
        exit 1
      fi
      
      response=$(admin_request "POST" "/subscribe/end-all")
      exit_code=$?
      
      if [ $exit_code -eq 0 ]; then
        http_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | sed '$d')
        if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
          echo "$body" | jq '.' 2>/dev/null || echo "$body"
          echo ""
          echo "✅ All subscriptions have been cancelled"
          echo "   Restart the API to verify: node api.js"
        else
          echo "❌ Error: HTTP $http_code"
          echo "$body"
        fi
      else
        echo "❌ Failed to connect to API"
        exit 1
      fi
    else
      echo "❌ Cancelled"
    fi
    ;;
    
  health)
    echo "💚 Health check..."
    curl -s "$BASE_URL/health" | jq '.' 2>/dev/null || curl -s "$BASE_URL/health"
    ;;
    
  help|--help|-h)
    echo "Admin API Helper Script"
    echo ""
    echo "Usage: ./scripts/admin.sh [command] [args...]"
    echo ""
    echo "Commands:"
    echo "  list, ls              List all subscriptions"
    echo "  jobs, scheduler      List all scheduled jobs"
    echo "  get EMAIL            Get subscription by email"
    echo "  update ID JSON       Update subscription"
    echo "  delete ID            Delete subscription"
    echo "  test ID SECONDS      Schedule test job"
    echo "  stop-job ID          Stop scheduled job"
    echo "  end-all, stop-all    End all subscriptions (stops all jobs)"
    echo "  health               Health check"
    echo "  help                 Show this help"
    echo ""
    echo "Examples:"
    echo "  ./scripts/admin.sh list"
    echo "  ./scripts/admin.sh update 123 '{\"status\":\"confirmed\"}'"
    echo "  ./scripts/admin.sh delete 123"
    echo "  ./scripts/admin.sh test 123 20"
    echo "  ./scripts/admin.sh end-all"
    echo ""
    echo "API Key is automatically loaded from .env file"
    echo "Current API Key: ${API_KEY:0:8}..."
    echo "Base URL: $BASE_URL"
    ;;
    
  *)
    echo "❌ Unknown command: $COMMAND"
    echo "Run './scripts/admin.sh help' for usage"
    exit 1
    ;;
esac

