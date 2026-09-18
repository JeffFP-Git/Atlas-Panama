# Admin API Documentation

All admin endpoints require an API key. Set `API_KEY` in your `.env` file to enable protection.

## Authentication

Include your API key in one of these ways:

**Header:**
```bash
curl -H "X-API-Key: your-api-key" http://localhost:3000/admin/endpoint
```

**Authorization Header:**
```bash
curl -H "Authorization: Bearer your-api-key" http://localhost:3000/admin/endpoint
```

**Query Parameter:**
```bash
curl "http://localhost:3000/admin/endpoint?apiKey=your-api-key"
```

## Admin Endpoints

### List All Subscriptions

**GET** `/subscribe/requests`

List all subscriptions with optional filtering.

**Query Parameters:**
- `status` - Filter by status (pending, processing, completed, confirmed, cancelled, rejected, error)
- `email` - Filter by email address
- `confirmed` - Filter by confirmed status (true/false)
- `tipo` - Filter by type (inmueble, mercantil, fundacion)

**Example:**
```bash
curl -H "X-API-Key: your-api-key" \
  "http://localhost:3000/subscribe/requests?status=confirmed"
```

**Response:**
```json
{
  "ok": true,
  "requests": [
    {
      "id": "1234567890-abc123",
      "email": "user@example.com",
      "tipo": "inmueble",
      "folio": "97213",
      "codigo": "8308",
      "status": "confirmed",
      "confirmed": true,
      "scheduled": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "accessToken": "a1b2c3d4..."
    }
  ],
  "count": 1
}
```

### Update Subscription

**PUT** `/subscribe/request/:id`

Update subscription fields (admin only).

**Allowed Fields:**
- `email` - Email address
- `tipo` - Type (inmueble, mercantil, fundacion)
- `nameOrFolio` - Name or folio (for mercantil/fundacion)
- `folio` - Folio number (for inmueble)
- `codigo` - Location code (for inmueble)
- `status` - Status (pending, processing, completed, confirmed, cancelled, rejected, error)
- `scheduled` - Whether scheduled (boolean)
- `confirmed` - Confirmed status (boolean)
- `runTime` - Daily run time (e.g., "09:00") - only used when activating

**Example:**
```bash
curl -X PUT -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "confirmed", "runTime": "10:00"}' \
  http://localhost:3000/subscribe/request/1234567890-abc123
```

**Response:**
```json
{
  "ok": true,
  "message": "Subscription updated successfully",
  "subscription": {
    "id": "1234567890-abc123",
    "status": "confirmed",
    "scheduled": true,
    ...
  }
}
```

**Notes:**
- If status changes to `cancelled`, scheduled job is automatically stopped
- If status changes to `confirmed` and wasn't scheduled, it will be scheduled (use `runTime` to set time)

### Delete Subscription

**DELETE** `/subscribe/request/:id`

Delete a subscription (admin only). Also stops any scheduled jobs.

**Example:**
```bash
curl -X DELETE -H "X-API-Key: your-api-key" \
  http://localhost:3000/subscribe/request/1234567890-abc123
```

**Response:**
```json
{
  "ok": true,
  "message": "Subscription deleted successfully",
  "subscription": {
    "id": "1234567890-abc123",
    "email": "user@example.com",
    ...
  }
}
```

### List Scheduled Jobs

**GET** `/scheduler/list`

List all active scheduled jobs (daily and test jobs).

**Example:**
```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/scheduler/list
```

**Response:**
```json
{
  "ok": true,
  "jobs": [
    {
      "jobId": "daily-1234567890-abc123",
      "subscriptionId": "1234567890-abc123",
      "tipo": "inmueble",
      "email": "user@example.com",
      "runTime": "09:00",
      "isTest": false,
      "scheduledAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Schedule Test Job

**POST** `/scheduler/test`

Schedule a one-time test run for a subscription.

**Body:**
```json
{
  "subscriptionId": "1234567890-abc123",
  "delaySeconds": 20
}
```

**Example:**
```bash
curl -X POST -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"subscriptionId": "1234567890-abc123", "delaySeconds": 20}' \
  http://localhost:3000/scheduler/test
```

**Response:**
```json
{
  "ok": true,
  "jobId": "test-1234567890-abc123-1234567890",
  "subscriptionId": "1234567890-abc123",
  "delaySeconds": 20,
  "scheduledAt": "2025-01-01T00:00:00.000Z",
  "willRunAt": "2025-01-01T00:00:20.000Z"
}
```

### Remove Scheduled Job

**DELETE** `/scheduler/:id`

Stop and remove a scheduled job (daily or test).

**Example:**
```bash
curl -X DELETE -H "X-API-Key: your-api-key" \
  http://localhost:3000/scheduler/1234567890-abc123
```

**Response:**
```json
{
  "ok": true,
  "message": "Job removed",
  "jobId": "1234567890-abc123"
}
```

## Common Admin Tasks

### Activate a Subscription Manually

```bash
# Update status to confirmed and set run time
curl -X PUT -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "confirmed", "runTime": "09:00"}' \
  http://localhost:3000/subscribe/request/SUBSCRIPTION_ID
```

### Cancel a Subscription

```bash
# Option 1: Update status to cancelled
curl -X PUT -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "cancelled"}' \
  http://localhost:3000/subscribe/request/SUBSCRIPTION_ID

# Option 2: Delete subscription entirely
curl -X DELETE -H "X-API-Key: your-api-key" \
  http://localhost:3000/subscribe/request/SUBSCRIPTION_ID
```

### Change Daily Run Time

```bash
# Stop current job, update subscription, reschedule
curl -X DELETE -H "X-API-Key: your-api-key" \
  http://localhost:3000/scheduler/SUBSCRIPTION_ID

curl -X PUT -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"runTime": "10:00"}' \
  http://localhost:3000/subscribe/request/SUBSCRIPTION_ID

# Then reschedule (status must be confirmed)
curl -X PUT -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "confirmed", "runTime": "10:00"}' \
  http://localhost:3000/subscribe/request/SUBSCRIPTION_ID
```

### List All Confirmed Subscriptions

```bash
curl -H "X-API-Key: your-api-key" \
  "http://localhost:3000/subscribe/requests?confirmed=true&status=confirmed"
```

### Find Subscriptions by Email

```bash
curl -H "X-API-Key: your-api-key" \
  "http://localhost:3000/subscribe/requests?email=user@example.com"
```

## Security Notes

- All admin endpoints require API key authentication
- If `API_KEY` is not set in `.env`, endpoints are accessible (development mode)
- In production, always set `API_KEY` to a strong, random value
- API key can be provided via header (`X-API-Key`), Authorization header (`Bearer TOKEN`), or query parameter (`apiKey`)

## Error Responses

**Missing API Key:**
```json
{
  "ok": false,
  "error": "api_key_required"
}
```

**Invalid API Key:**
```json
{
  "ok": false,
  "error": "api_key_required"
}
```

**Not Found:**
```json
{
  "ok": false,
  "error": "not_found"
}
```

