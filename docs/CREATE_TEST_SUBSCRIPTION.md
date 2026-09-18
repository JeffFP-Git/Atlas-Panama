# Create and Test a New Subscription

Quick guide to create a new subscription and test the scheduler.

## Option 1: Using the Helper Script

```bash
# Create an inmueble subscription
./scripts/create-test-subscription.sh your@email.com inmueble 97213 8308

# Create a mercantil subscription
./scripts/create-test-subscription.sh your@email.com mercantil "" "" "lazy daze"
```

## Option 2: Manual Steps

### Step 1: Create a Subscription

**For Inmueble (Property):**
```bash
curl -X POST http://localhost:3000/subscribe/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "tipo": "inmueble",
    "folio": "97213",
    "codigo": "8308"
  }' | jq
```

**For Mercantil (Business):**
```bash
curl -X POST http://localhost:3000/subscribe/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "tipo": "mercantil",
    "nameOrFolio": "lazy daze"
  }' | jq
```

**For Fundación (Foundation):**
```bash
curl -X POST http://localhost:3000/subscribe/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "tipo": "fundacion",
    "nameOrFolio": "Foundation Name"
  }' | jq
```

Save the `requestId` from the response.

### Step 2: Wait for Processing

The intro pipeline will run automatically. Check status:

```bash
# Replace REQUEST_ID with the ID from step 1
curl http://localhost:3000/subscribe/request/REQUEST_ID | jq
```

Wait until `status` is `"completed"`.

### Step 3: Confirm the Subscription

```bash
curl -X POST http://localhost:3000/subscribe/request/REQUEST_ID/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "isCorrect": true,
    "runTime": "09:00"
  }' | jq
```

This will:
- Confirm the subscription
- Schedule a daily job at 09:00
- Run an immediate job in the background

### Step 4: Schedule a Test Run (20 seconds)

```bash
curl -X POST http://localhost:3000/scheduler/test \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptionId": "REQUEST_ID",
    "delaySeconds": 20
  }' | jq
```

### Step 5: Verify It's Scheduled

```bash
curl http://localhost:3000/scheduler/list | jq '.jobs[] | select(.subscriptionId == "REQUEST_ID")'
```

## Quick One-Liner (After Confirmation)

Once you have a confirmed subscription ID:

```bash
# Set your subscription ID
SUB_ID="your-subscription-id"

# Schedule test run
curl -X POST http://localhost:3000/scheduler/test \
  -H "Content-Type: application/json" \
  -d "{\"subscriptionId\": \"$SUB_ID\", \"delaySeconds\": 20}" | jq

# Watch it in the list
watch -n 1 "curl -s http://localhost:3000/scheduler/list | jq '.jobs[] | select(.subscriptionId == \"$SUB_ID\")'"
```

## Example: Complete Flow

```bash
# 1. Create subscription
RESPONSE=$(curl -s -X POST http://localhost:3000/subscribe/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "tipo": "inmueble",
    "folio": "97213",
    "codigo": "8308"
  }')

SUB_ID=$(echo $RESPONSE | jq -r '.requestId')
echo "Created subscription: $SUB_ID"

# 2. Wait for completion (check status)
echo "Waiting for processing..."
sleep 10

# 3. Confirm
curl -X POST http://localhost:3000/subscribe/request/$SUB_ID/confirm \
  -H "Content-Type: application/json" \
  -d '{"isCorrect": true, "runTime": "09:00"}' | jq

# 4. Schedule test run
curl -X POST http://localhost:3000/scheduler/test \
  -H "Content-Type: application/json" \
  -d "{\"subscriptionId\": \"$SUB_ID\", \"delaySeconds\": 20}" | jq

# 5. Monitor
echo "Test job scheduled! Check logs in 20 seconds..."
```

## Notes

- Subscriptions must be **confirmed** before they can be scheduled
- The intro pipeline runs automatically when you create a subscription
- Test runs are **one-time only** and run after the specified delay
- Daily jobs run **every day** at the scheduled time
- You can have multiple subscriptions for the same property/business


