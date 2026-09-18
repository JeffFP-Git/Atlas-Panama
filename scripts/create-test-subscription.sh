#!/bin/bash
# Create a test subscription and optionally schedule a test run

API_URL="${API_URL:-http://localhost:3000}"

# Default values
EMAIL="${1:-test@example.com}"
TIPO="${2:-inmueble}"
FOLIO="${3:-97213}"
CODIGO="${4:-8308}"
NAME="${5:-test company}"

echo "Creating test subscription..."
echo "  Email: $EMAIL"
echo "  Tipo: $TIPO"

if [ "$TIPO" = "inmueble" ]; then
  echo "  Folio: $FOLIO"
  echo "  Código: $CODIGO"
  RESPONSE=$(curl -s -X POST "${API_URL}/subscribe/submit" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"$EMAIL\",
      \"tipo\": \"$TIPO\",
      \"folio\": \"$FOLIO\",
      \"codigo\": \"$CODIGO\"
    }")
else
  echo "  Name: $NAME"
  RESPONSE=$(curl -s -X POST "${API_URL}/subscribe/submit" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"$EMAIL\",
      \"tipo\": \"$TIPO\",
      \"nameOrFolio\": \"$NAME\"
    }")
fi

echo ""
echo "Response:"
echo "$RESPONSE" | jq

# Extract request ID
REQUEST_ID=$(echo "$RESPONSE" | jq -r '.requestId // .id // empty')

if [ -z "$REQUEST_ID" ] || [ "$REQUEST_ID" = "null" ]; then
  echo ""
  echo "❌ Failed to create subscription"
  exit 1
fi

echo ""
echo "✅ Subscription created with ID: $REQUEST_ID"
echo ""
echo "Waiting for intro pipeline to complete (this may take a minute)..."
echo "   (You can check status with: curl ${API_URL}/subscribe/request/$REQUEST_ID | jq)"

# Wait a bit for processing
sleep 3

# Check status
STATUS=$(curl -s "${API_URL}/subscribe/request/${REQUEST_ID}" | jq -r '.request.status // empty')
echo ""
echo "Current status: $STATUS"

if [ "$STATUS" = "completed" ]; then
  echo ""
  echo "To confirm and schedule, run:"
  echo "  curl -X POST ${API_URL}/subscribe/request/$REQUEST_ID/confirm \\"
  echo "    -H 'Content-Type: application/json' \\"
  echo "    -d '{\"isCorrect\": true, \"runTime\": \"09:00\"}'"
  echo ""
  echo "Or to schedule a test run immediately:"
  echo "  curl -X POST ${API_URL}/scheduler/test \\"
  echo "    -H 'Content-Type: application/json' \\"
  echo "    -d '{\"subscriptionId\": \"$REQUEST_ID\", \"delaySeconds\": 20}'"
else
  echo ""
  echo "Subscription is still processing. Check status with:"
  echo "  curl ${API_URL}/subscribe/request/$REQUEST_ID | jq"
fi


