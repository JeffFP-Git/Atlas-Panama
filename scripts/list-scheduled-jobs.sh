#!/bin/bash
# Pretty print scheduled jobs

API_URL="${API_URL:-http://localhost:3000}"

# Check if jq is available
if command -v jq &> /dev/null; then
  curl -s "${API_URL}/scheduler/list" | jq
else
  # Fallback to Python if jq is not available
  curl -s "${API_URL}/scheduler/list" | python3 -m json.tool
fi


