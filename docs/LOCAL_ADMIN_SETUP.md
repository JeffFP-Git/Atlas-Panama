# Local Admin Setup Guide

Quick guide to set up and test admin functionality locally.

## Step 1: Generate an API Key

**Option A: Using OpenSSL (Recommended)**
```bash
openssl rand -hex 32
```

**Option B: Using Node.js**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Option C: Using Python**
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

**Example output:** `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2`

## Step 2: Add API Key to .env File

Create or edit `.env` file in the project root:

```bash
# If .env doesn't exist, create it
touch .env

# Edit .env file
nano .env
# or
code .env
```

Add the API key:

```bash
# API Security
API_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2

# Optional: Set base URL for email links
API_BASE_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000

# Optional: Set daily run time (default: 09:00)
DAILY_RUN_TIME=09:00
```

**Save the API key somewhere safe** - you'll need it for all admin API calls!

## Step 3: Start the API Server

```bash
# Make sure you're in the project directory
cd /Users/jonathanchristie/Code/panama-scraper

# Start the API
node api.js
```

You should see output like:
```
✅ API listening on 0.0.0.0:3000 (concurrency=5)
```

**Keep this terminal open** - the API is now running!

## Step 4: Use the Admin Helper Script (Easiest Way)

The helper script automatically reads your API key from `.env`:

```bash
# List all subscriptions
./scripts/admin.sh list

# List scheduled jobs
./scripts/admin.sh jobs

# Get subscription by email
./scripts/admin.sh get test@example.com

# Update subscription
./scripts/admin.sh update SUBSCRIPTION_ID '{"status":"confirmed","runTime":"09:00"}'

# Delete subscription
./scripts/admin.sh delete SUBSCRIPTION_ID

# Schedule test job
./scripts/admin.sh test SUBSCRIPTION_ID 20

# Stop scheduled job
./scripts/admin.sh stop-job JOB_ID

# Health check
./scripts/admin.sh health

# Show help
./scripts/admin.sh help
```

**No need to pass the API key manually!** The script reads it from `.env` automatically.

## Step 5: Test Admin Endpoints Manually (Alternative)

If you prefer using curl directly, you'll need to pass the API key:

### Test 1: List Subscriptions (Should Fail Without Key)

```bash
# This should fail with "api_key_required"
curl http://localhost:3000/subscribe/requests
```

Expected response:
```json
{"ok":false,"error":"api_key_required"}
```

### Test 2: List Subscriptions (With API Key)

**Option A: Read from .env manually**
```bash
# Load API key from .env
export API_KEY=$(grep API_KEY .env | cut -d '=' -f2)

# Use it in curl
curl -H "X-API-Key: $API_KEY" \
  http://localhost:3000/subscribe/requests | jq
```

**Option B: Use helper script (recommended)**
```bash
./scripts/admin.sh list
```

**Option C: Pass key directly**
```bash
curl -H "X-API-Key: your-api-key-here" \
  http://localhost:3000/subscribe/requests | jq
```

### Test 3: List Scheduled Jobs

```bash
# Using helper script
./scripts/admin.sh jobs

# Or manually
export API_KEY=$(grep API_KEY .env | cut -d '=' -f2)
curl -H "X-API-Key: $API_KEY" \
  http://localhost:3000/scheduler/list | jq
```

## Step 6: Create a Test Subscription

First, create a subscription (public endpoint, no API key needed):

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

Expected response:
```json
{
  "ok": true,
  "requestId": "1234567890-abc123",
  "status": "pending",
  "message": "Check your email for an access link to view your subscription status"
}
```

**Note the `requestId`** - you'll need it for admin operations!

## Step 7: Test Admin Operations

### Using Helper Script (Recommended)

```bash
# List all subscriptions
./scripts/admin.sh list

# Update subscription status
./scripts/admin.sh update 1234567890-abc123 '{"status":"confirmed","runTime":"09:00"}'

# Delete subscription
./scripts/admin.sh delete 1234567890-abc123

# Schedule test job
./scripts/admin.sh test 1234567890-abc123 20

# Stop scheduled job
./scripts/admin.sh stop-job 1234567890-abc123
```

### Using curl Directly

```bash
# Load API key from .env
export API_KEY=$(grep API_KEY .env | cut -d '=' -f2)

# List subscriptions
curl -H "X-API-Key: $API_KEY" \
  http://localhost:3000/subscribe/requests | jq

# Update subscription
curl -X PUT -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "confirmed", "runTime": "10:00"}' \
  http://localhost:3000/subscribe/request/SUBSCRIPTION_ID | jq

# Delete subscription
curl -X DELETE -H "X-API-Key: $API_KEY" \
  http://localhost:3000/subscribe/request/SUBSCRIPTION_ID | jq
```

## Quick Reference

### Environment Variables

```bash
# Required for admin endpoints
API_KEY=your-secret-api-key

# Optional
API_BASE_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000
DAILY_RUN_TIME=09:00
```

### Helper Script Commands

```bash
./scripts/admin.sh list              # List subscriptions
./scripts/admin.sh jobs               # List scheduled jobs
./scripts/admin.sh get EMAIL         # Get subscription by email
./scripts/admin.sh update ID JSON    # Update subscription
./scripts/admin.sh delete ID         # Delete subscription
./scripts/admin.sh test ID SECONDS   # Schedule test job
./scripts/admin.sh stop-job ID      # Stop scheduled job
./scripts/admin.sh health            # Health check
./scripts/admin.sh help              # Show help
```

### Manual curl Commands

```bash
# Load API key from .env
export API_KEY=$(grep API_KEY .env | cut -d '=' -f2)

# List subscriptions
curl -H "X-API-Key: $API_KEY" http://localhost:3000/subscribe/requests | jq

# List scheduled jobs
curl -H "X-API-Key: $API_KEY" http://localhost:3000/scheduler/list | jq

# Update subscription
curl -X PUT -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "confirmed"}' \
  http://localhost:3000/subscribe/request/ID | jq

# Delete subscription
curl -X DELETE -H "X-API-Key: $API_KEY" \
  http://localhost:3000/subscribe/request/ID | jq
```

## Troubleshooting

### "api_key_required" Error

- Make sure `API_KEY` is set in `.env` file
- Make sure you're including the header: `X-API-Key: YOUR_KEY`
- Restart the API server after changing `.env`
- If using helper script, make sure `.env` file exists in project root

### API Not Starting

- Check if port 3000 is already in use: `lsof -i :3000`
- Kill existing process: `kill -9 $(lsof -t -i:3000)`
- Or change port: `PORT=3001 node api.js`

### Can't Find Subscriptions

- Make sure you created a subscription first (Step 6)
- Check the `requestId` matches what you're querying
- List all subscriptions to see what's available: `./scripts/admin.sh list`

### JSON Output Not Formatted

Install `jq` for pretty JSON:
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

The helper script automatically uses `jq` if available.

### Helper Script Not Working

- Make sure script is executable: `chmod +x scripts/admin.sh`
- Check that `.env` file exists in project root
- Verify `API_KEY` is set in `.env`: `grep API_KEY .env`

## How It Works

**Important:** The `.env` file is read by:
1. **The server** (api.js) - to know what API key to expect
2. **The helper script** (admin.sh) - to automatically include the key in requests

**You still need to send the API key in requests** - the helper script does this automatically by reading from `.env`.

## Next Steps

- See `docs/ADMIN_API.md` for complete API documentation
- See `docs/SCHEDULER_QUICK_START.md` for scheduler operations
- Test creating, updating, and deleting subscriptions
- Test scheduling and canceling jobs
