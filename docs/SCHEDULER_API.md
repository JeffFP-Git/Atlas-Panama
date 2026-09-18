# Scheduler API Documentation

This document describes the API endpoints for managing scheduled runs.

## Endpoints

### 1. Schedule a Test Run

Schedule a one-time test run that executes after a specified delay (default: 20 seconds).

**Endpoint:** `POST /scheduler/test`

**Request Body:**
```json
{
  "subscriptionId": "1234567890-abc123",
  "delaySeconds": 20
}
```

**Parameters:**
- `subscriptionId` (required): The ID of the subscription to test
- `delaySeconds` (optional): Number of seconds to wait before running (default: 20, min: 1, max: 3600)

**Response:**
```json
{
  "ok": true,
  "jobId": "test-1234567890-abc123-1234567890123",
  "subscriptionId": "1234567890-abc123",
  "delaySeconds": 20,
  "scheduledAt": "2025-12-12T14:30:00.000Z",
  "willRunAt": "2025-12-12T14:30:20.000Z"
}
```

**Example using curl:**
```bash
curl -X POST http://localhost:3000/scheduler/test \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptionId": "1234567890-abc123",
    "delaySeconds": 20
  }'
```

**Example using JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/scheduler/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    subscriptionId: '1234567890-abc123',
    delaySeconds: 20
  })
});
const result = await response.json();
console.log('Test job scheduled:', result);
```

### 2. List All Scheduled Jobs

Get a list of all currently scheduled jobs (both daily recurring and one-time test jobs).

**Endpoint:** `GET /scheduler/list`

**Response:**
```json
{
  "ok": true,
  "count": 2,
  "jobs": [
    {
      "jobId": "1234567890-abc123",
      "subscriptionId": "1234567890-abc123",
      "tipo": "mercantil",
      "nameOrFolio": "lazy daze",
      "folio": null,
      "codigo": null,
      "email": "user@example.com",
      "runTime": "09:00",
      "isTest": false,
      "scheduledAt": "2025-12-12T10:00:00.000Z",
      "willRunAt": null
    },
    {
      "jobId": "test-1234567890-abc123-1234567890123",
      "subscriptionId": "1234567890-abc123",
      "tipo": "mercantil",
      "nameOrFolio": "lazy daze",
      "folio": null,
      "codigo": null,
      "email": "user@example.com",
      "runTime": "in 20 seconds",
      "isTest": true,
      "scheduledAt": "2025-12-12T14:30:00.000Z",
      "willRunAt": "2025-12-12T14:30:20.000Z"
    }
  ]
}
```

**Example using curl:**
```bash
curl http://localhost:3000/scheduler/list
```

**Example using JavaScript:**
```javascript
const response = await fetch('http://localhost:3000/scheduler/list');
const result = await response.json();
console.log('Scheduled jobs:', result.jobs);
```

### 3. Remove a Scheduled Job

Remove a scheduled job by job ID or subscription ID.

**Endpoint:** `DELETE /scheduler/:id`

**Parameters:**
- `id` (path parameter): The job ID or subscription ID to remove

**Response:**
```json
{
  "ok": true,
  "message": "Job removed",
  "jobId": "1234567890-abc123"
}
```

**Example using curl:**
```bash
# Remove by job ID
curl -X DELETE http://localhost:3000/scheduler/test-1234567890-abc123-1234567890123

# Remove by subscription ID (also works)
curl -X DELETE http://localhost:3000/scheduler/1234567890-abc123
```

**Example using JavaScript:**
```javascript
const jobId = 'test-1234567890-abc123-1234567890123';
const response = await fetch(`http://localhost:3000/scheduler/${jobId}`, {
  method: 'DELETE'
});
const result = await response.json();
console.log('Job removed:', result);
```

## Getting Subscription IDs

To get the subscription ID for testing, you can:

1. **From the web app:** After submitting a subscription, the response includes a `requestId` which is the subscription ID.

2. **List all subscriptions:**
   ```bash
   curl http://localhost:3000/subscribe/requests
   ```
   (Note: This endpoint may need to be added if it doesn't exist)

3. **Check the API response** when you confirm a subscription - it includes the subscription ID.

## Testing Workflow

1. **Submit a subscription** through the web app or API
2. **Confirm the subscription** (this schedules the daily job)
3. **Get the subscription ID** from the confirmation response
4. **Schedule a test run:**
   ```bash
   curl -X POST http://localhost:3000/scheduler/test \
     -H "Content-Type: application/json" \
     -d '{"subscriptionId": "YOUR_SUBSCRIPTION_ID", "delaySeconds": 20}'
   ```
5. **Monitor the logs** to see the test run execute after 20 seconds
6. **List scheduled jobs** to verify:
   ```bash
   curl http://localhost:3000/scheduler/list
   ```
7. **Remove test jobs** when done:
   ```bash
   curl -X DELETE http://localhost:3000/scheduler/TEST_JOB_ID
   ```

## Notes

- Test jobs are **one-time only** - they run once and then are automatically removed
- Daily jobs run **every day** at the specified time (default: 09:00)
- Test jobs use `setTimeout` internally, while daily jobs use `node-cron`
- All jobs run asynchronously and don't block the API
- Jobs are stored in memory and will be lost on server restart (daily jobs are reloaded from storage on startup)


