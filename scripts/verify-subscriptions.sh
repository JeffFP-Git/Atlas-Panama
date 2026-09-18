#!/bin/bash
# Verify subscription status in the storage file

STORAGE_FILE="data/intro-requests.json"

if [ ! -f "$STORAGE_FILE" ]; then
  echo "❌ Storage file not found: $STORAGE_FILE"
  exit 1
fi

echo "📋 Checking subscription statuses..."
echo ""

# Count subscriptions by status
echo "Status breakdown:"
jq -r '.subscriptions[] | "\(.id) | confirmed=\(.confirmed) | status=\(.status) | scheduled=\(.scheduled)"' "$STORAGE_FILE" | sort
echo ""

# Count confirmed subscriptions
CONFIRMED_COUNT=$(jq '[.subscriptions[] | select(.confirmed == true and .status == "confirmed")] | length' "$STORAGE_FILE")
echo "Subscriptions with confirmed=true AND status='confirmed': $CONFIRMED_COUNT"
echo ""

if [ "$CONFIRMED_COUNT" -gt 0 ]; then
  echo "⚠️  Found $CONFIRMED_COUNT subscriptions that will be loaded on API restart:"
  jq -r '.subscriptions[] | select(.confirmed == true and .status == "confirmed") | "  - \(.id) (\(.nameOrFolio // .folio))"' "$STORAGE_FILE"
  echo ""
  echo "💡 Run './scripts/admin.sh end-all' to cancel them (make sure API is running)"
fi

