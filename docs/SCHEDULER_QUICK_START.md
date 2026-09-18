# Scheduler Quick Start Guide

Quick reference for testing and managing scheduled runs.

## Quick Test Command

Schedule a test run for 20 seconds from now:

```bash
curl -X POST http://localhost:3000/scheduler/test \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptionId": "YOUR_SUBSCRIPTION_ID",
    "delaySeconds": 20
  }'
```

## Find Your Subscription ID

List all subscriptions to find the ID:

```bash
curl http://localhost:3000/subscribe/requests
```

Or filter by email:

```bash
curl "http://localhost:3000/subscribe/requests?email=your@email.com"
```

## List All Scheduled Jobs

```bash
curl http://localhost:3000/scheduler/list
```

## Remove a Scheduled Job

```bash
# Remove by job ID
curl -X DELETE http://localhost:3000/scheduler/JOB_ID

# Remove by subscription ID (also works)
curl -X DELETE http://localhost:3000/scheduler/SUBSCRIPTION_ID
```

## Complete Testing Workflow

1. **Get your subscription ID:**
   ```bash
   curl http://localhost:3000/subscribe/requests | jq '.requests[] | {id, tipo, nameOrFolio, email, confirmed}'
   ```

2. **Schedule a test run (20 seconds):**
   ```bash
   curl -X POST http://localhost:3000/scheduler/test \
     -H "Content-Type: application/json" \
     -d '{"subscriptionId": "YOUR_ID", "delaySeconds": 20}'
   ```

3. **Check it's scheduled:**
   ```bash
   curl http://localhost:3000/scheduler/list | jq '.jobs[] | {jobId, subscriptionId, isTest, willRunAt}'
   ```

4. **Wait 20 seconds and check logs** - you should see the job execute

5. **Clean up test job (if needed):**
   ```bash
   curl -X DELETE http://localhost:3000/scheduler/TEST_JOB_ID
   ```

## Example: Testing "lazy daze" Subscription

```bash
# 1. Find the subscription
SUBSCRIPTION_ID=$(curl -s http://localhost:3000/subscribe/requests | \
  jq -r '.requests[] | select(.nameOrFolio == "lazy daze") | .id')

echo "Found subscription: $SUBSCRIPTION_ID"

# 2. Schedule test run
curl -X POST http://localhost:3000/scheduler/test \
  -H "Content-Type: application/json" \
  -d "{\"subscriptionId\": \"$SUBSCRIPTION_ID\", \"delaySeconds\": 20}"

# 3. Monitor (watch the API logs)
echo "Test job scheduled! Watch the logs for execution in 20 seconds..."

# 4. Verify it ran
sleep 25
curl http://localhost:3000/scheduler/list | jq '.jobs'
```

## Notes

- Test jobs run **once** and are automatically removed after execution
- Daily jobs run **every day** at the scheduled time
- All times are in **America/Panama** timezone
- Jobs are stored in memory (lost on restart, but daily jobs reload from storage)


