# Concurrency Experiment (Local)

Goal: reproduce production failures by running **5 jobs concurrently** against the **local API**.

This repo’s `POST /run*` endpoints are **non-blocking**: they enqueue a job and start it when there is concurrency capacity (`MAX_CONCURRENCY`).

Supported paths:
- `POST /run` (main scraper)
- `POST /run/finca` (finca prelación scrape, writes an `.xlsx`)
- `POST /run/mercantil` (mercantil members scrape, writes an `.xlsx`)
- `POST /run/subscription` (runs the daily subscription job for a specific subscription id)
- `POST /run/subscriptions` (batch enqueue multiple subscription daily jobs)

## 1) Start the API locally (with concurrency = 5)

In Terminal A (from the repo root):

```bash
PORT=3000 MAX_CONCURRENCY=5 node api.js
```

If you suspect Chrome profile locking / shared session issues, you can also set a **shared** profile dir:

```bash
PORT=3000 MAX_CONCURRENCY=5 USER_DATA_DIR=./chrome-profile node api.js
```

Verify it’s up:

```bash
curl http://localhost:3000/health
```

You should see JSON like:

```json
{ "ok": true, "running": 0, "queued": 0, "concurrency": 5 }
```

## 2) Schedule 5 runs to start at the same time (now + 2 minutes)

In Terminal B (from the repo root):

### Option 0: run 5 existing subscriptions concurrently (production-like)

1) Get 5 subscription IDs (admin endpoint):

```bash
API_KEY=your_api_key
curl -H "X-API-Key: $API_KEY" "http://localhost:3000/subscribe/requests?status=confirmed" | jq
```

2) Run those 5 subscriptions concurrently at T+120s:

- Batch enqueue in one request (best for “cron fired them all at once” simulation):

```bash
npm run experiment:concurrency -- --path /run/subscriptions --delay-seconds 120 --payloads '[{"subscriptionIds":["ID1","ID2","ID3","ID4","ID5"]}]'
```

- Or fire 5 separate requests at the same time (best for “5 clients hit at once” simulation):

```bash
npm run experiment:concurrency -- --path /run/subscription --delay-seconds 120 --payloads '[{"subscriptionId":"ID1"},{"subscriptionId":"ID2"},{"subscriptionId":"ID3"},{"subscriptionId":"ID4"},{"subscriptionId":"ID5"}]'
```

### Option A: finca prelación (recommended for your case)

Make sure `.env` has at least:

```bash
RP_USERNAME=...
RP_PASSWORD=...
```

Then run:

```bash
npm run experiment:concurrency -- --path /run/finca --delay-seconds 120 --count 5 --payload '{"name":"Company Name","headless":1}'
```

### Option B: mercantil members

```bash
npm run experiment:concurrency -- --path /run/mercantil --delay-seconds 120 --count 5 --payload '{"ownerName":"Company Name","headless":1}'
```

## 3) Read results

The script writes a JSON summary to:
- `debug-output/concurrency-experiment-<timestamp>.json`

It also prints each job’s final status (`done` / `error`) and any error message.

## Notes / knobs

- If you want to test “client concurrency” but **not** “job concurrency”, keep `MAX_CONCURRENCY=1` (requests are still concurrent, jobs will serialize).
- Each finca/mercantil job writes an `.xlsx` to `BuildingData/` with a **unique name per job** by default.
  - To force file contention, include a fixed `outputName` in the payload for all 5 requests.
- To force Chrome profile contention, set `USER_DATA_DIR` (or pass `userDataDir` in the payload) to the **same directory** for all 5 jobs.

