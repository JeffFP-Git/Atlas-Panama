import fs from 'fs';
import path from 'path';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function iso(d) {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function waitUntil(startAt) {
  const target = startAt instanceof Date ? startAt : new Date(startAt);
  if (Number.isNaN(target.getTime())) throw new Error(`Invalid start time: ${startAt}`);
  while (true) {
    const now = Date.now();
    const remaining = target.getTime() - now;
    if (remaining <= 0) return;
    // Sleep in short intervals to reduce drift for "start together" testing.
    await sleep(Math.min(remaining, 250));
  }
}

async function postRun(baseUrl, payload, idx) {
  const apiPath = String(payload?.__path || '').trim();
  const pathToUse = apiPath || String(process.env.API_PATH || '/run');
  const startedAt = new Date();
  const res = await fetch(`${baseUrl}${pathToUse.startsWith('/') ? '' : '/'}${pathToUse}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Run-Index': String(idx),
    },
    body: JSON.stringify(payload),
  });
  const endedAt = new Date();
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return {
    idx,
    requestStartedAt: startedAt.toISOString(),
    responseReceivedAt: endedAt.toISOString(),
    httpStatus: res.status,
    ok: res.ok,
    body: json,
  };
}

async function getJob(baseUrl, jobId) {
  const res = await fetch(`${baseUrl}/jobs/${jobId}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`GET /jobs/${jobId} failed: HTTP ${res.status} ${JSON.stringify(json)}`);
  }
  return json?.job;
}

async function pollJobUntilDone(baseUrl, jobId, pollIntervalMs) {
  while (true) {
    const job = await getJob(baseUrl, jobId);
    if (['done', 'error', 'cancelled'].includes(job?.status)) return job;
    await sleep(pollIntervalMs);
  }
}

const args = parseArgs(process.argv.slice(2));

const baseUrl =
  args['base-url'] ||
  process.env.API_BASE_URL ||
  `http://localhost:${process.env.PORT || 3000}`;

const count = num(args.count ?? process.env.COUNT, 5);
const delaySeconds = num(args['delay-seconds'] ?? process.env.DELAY_SECONDS, 120);
const pollIntervalMs = num(args['poll-ms'] ?? process.env.POLL_INTERVAL_MS, 2000);

const payloadFromEnv = process.env.PAYLOAD_JSON;
const payloadsFromEnv = process.env.PAYLOADS_JSON;
const buildingName = args.building ?? process.env.BUILDING_NAME;
const searchParam = args.search ?? process.env.SEARCH_PARAMETER ?? buildingName;

let payloads = null;
if (args.payloads) {
  payloads = JSON.parse(args.payloads);
} else if (payloadsFromEnv) {
  payloads = JSON.parse(payloadsFromEnv);
}
if (payloads && !Array.isArray(payloads)) {
  throw new Error('payloads must be a JSON array');
}

const payload =
  args.payload
    ? JSON.parse(args.payload)
    : payloadFromEnv
      ? JSON.parse(payloadFromEnv)
      : {
          buildingName,
          searchParam,
          maxProperties: args.max ? Number(args.max) : undefined,
          headless: args.headless ? Number(args.headless) : 1,
        };

// Allow overriding the API path per run without changing payload semantics
// Usage: --path /run/finca (or set API_PATH), and payload should match that endpoint
const apiPath = args.path || args.endpoint || process.env.API_PATH || '/run';
if (apiPath) {
  payload.__path = apiPath;
}

// If payloads array is provided, apply default path to any entry missing __path
if (payloads) {
  payloads = payloads.map((p) => {
    const out = { ...(p || {}) };
    if (!out.__path) out.__path = apiPath;
    return out;
  });
}

if (!payloads && !payload?.buildingName && !payload?.searchParam) {
  // For non-main endpoints, accept other payload shapes (e.g. {name}, {ownerName}).
  const hasAlt = !!(payload?.name || payload?.ownerName || payload?.corporateName);
  if (!hasAlt) {
    process.stderr.write(
      `\nMissing payload. Provide one of:\n` +
        `- main: --payload '{"buildingName":"Ocean Waves","headless":1}'\n` +
        `- finca: --path /run/finca --payload '{"name":"Company Name","headless":1}'\n` +
        `- mercantil: --path /run/mercantil --payload '{"ownerName":"Company Name","headless":1}'\n\n`
    );
    process.exit(2);
  }
}

const now = new Date();
const startAt = args['start-at']
  ? new Date(args['start-at'])
  : new Date(Date.now() + delaySeconds * 1000);

const effectiveCount = payloads ? payloads.length : count;

process.stdout.write(
  `\nLocal concurrency experiment\n` +
    `- baseUrl: ${baseUrl}\n` +
    `- count: ${effectiveCount}\n` +
    `- path: ${payload.__path || '/run'}\n` +
    `- startAt: ${iso(startAt)} (now=${iso(now)}, delaySeconds=${delaySeconds})\n` +
    `- payload: ${payloads ? '[payloads array]' : JSON.stringify(payload)}\n\n`
);

await waitUntil(startAt);

process.stdout.write(`[${iso(new Date())}] Firing ${effectiveCount} concurrent POST requests...\n`);

const runResponses = await Promise.allSettled(
  payloads
    ? payloads.map((p, idx) => postRun(baseUrl, p, idx))
    : Array.from({ length: count }, (_, idx) => postRun(baseUrl, payload, idx))
);

const accepted = [];
const rejected = [];

for (const r of runResponses) {
  if (r.status === 'fulfilled') accepted.push(r.value);
  else rejected.push({ error: r.reason?.message || String(r.reason) });
}

if (rejected.length > 0) {
  process.stdout.write(`Request errors (${rejected.length}):\n`);
  for (const [i, r] of rejected.entries()) {
    process.stdout.write(`- #${i + 1}: ${r.error}\n`);
  }
}

const jobIds = accepted
  .filter((x) => x.ok && x.body?.jobId)
  .map((x) => x.body.jobId);

const non202 = accepted.filter((x) => !x.ok || !x.body?.jobId);
if (non202.length > 0) {
  process.stdout.write(`Non-accepted responses (${non202.length}):\n`);
  for (const r of non202) {
    process.stdout.write(`- idx=${r.idx} HTTP ${r.httpStatus} body=${JSON.stringify(r.body)}\n`);
  }
}

process.stdout.write(
  `POST /run done: accepted=${accepted.length}, rejected=${rejected.length}, jobIds=${jobIds.length}\n`
);

const jobsFinal = [];
for (const jobId of jobIds) {
  try {
    const job = await pollJobUntilDone(baseUrl, jobId, pollIntervalMs);
    jobsFinal.push(job);
    process.stdout.write(
      `- job ${jobId}: ${job.status}${job.error ? ` (${job.error})` : ''}\n`
    );
  } catch (e) {
    jobsFinal.push({ id: jobId, status: 'poll_error', error: e?.message || String(e) });
    process.stdout.write(`- job ${jobId}: poll_error (${e?.message || String(e)})\n`);
  }
}

const out = {
  meta: {
    baseUrl,
    count,
    delaySeconds,
    startAt: iso(startAt),
    payload,
    pollIntervalMs,
  },
  postRun: { accepted, rejected },
  jobsFinal,
};

const outDir = path.join(process.cwd(), 'debug-output');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `concurrency-experiment-${Date.now()}.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

process.stdout.write(`\nWrote results to ${outPath}\n\n`);

