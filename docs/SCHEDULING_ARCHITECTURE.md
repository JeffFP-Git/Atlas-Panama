# Scheduling Architecture & EC2 Deployment Guide

## Current Architecture (In-Memory `node-cron`)

### How It Works Now

1. **Job Storage**: 
   - Scheduled jobs are stored **in-memory** using a `Map` (`activeJobs`)
   - Subscription data is persisted to `data/intro-requests.json`
   - **Cron jobs themselves are NOT persisted**

2. **On API Startup**:
   ```javascript
   // api.js - initializeScheduler()
   1. Loads confirmed subscriptions from JSON file
   2. Calls scheduler.loadAndScheduleAll()
   3. Creates in-memory cron jobs using node-cron
   4. Jobs are stored in activeJobs Map (in-memory only)
   ```

3. **Scheduling**:
   ```javascript
   // dailyScheduler.js
   - Uses node-cron library
   - Creates cron expressions like "0 9 * * *" (9:00 AM daily)
   - Runs in the same Node.js process as the API
   - Timezone: 'America/Panama'
   ```

### Current Limitations for EC2

❌ **Single Point of Failure**: If the API process crashes, all scheduled jobs are lost
❌ **No Persistence**: Cron jobs only exist in memory - restart = lost schedules
❌ **No Coordination**: Can't run multiple API instances (would duplicate jobs)
❌ **No Monitoring**: Hard to track if jobs actually ran
❌ **Dependency on API**: Jobs only run if API server is running

---

## Production Deployment Options

### Option 1: Systemd Timers (Recommended for Single EC2)

**Best for**: Single EC2 instance, Linux (Ubuntu/Amazon Linux)

**Architecture**:
- Systemd handles scheduling at OS level
- API provides an HTTP endpoint to trigger jobs
- Systemd calls the endpoint at scheduled times
- Works even if API restarts

**Implementation**:

1. **Create a systemd service** (`/etc/systemd/system/panama-scraper-scheduler.service`):
```ini
[Unit]
Description=Panama Scraper Scheduler
After=network.target

[Service]
Type=oneshot
User=ec2-user
WorkingDirectory=/home/ec2-user/panama-scraper
Environment="NODE_ENV=production"
EnvironmentFile=/home/ec2-user/panama-scraper/.env
ExecStart=/usr/bin/node /home/ec2-user/panama-scraper/lib/runScheduledJobs.js
StandardOutput=journal
StandardError=journal
```

2. **Create a systemd timer** (`/etc/systemd/system/panama-scraper-scheduler.timer`):
```ini
[Unit]
Description=Run Panama Scraper Daily at 9 AM Panama Time
Requires=panama-scraper-scheduler.service

[Timer]
OnCalendar=*-*-* 09:00:00
Timezone=America/Panama
Persistent=true

[Install]
WantedBy=timers.target
```

3. **Create a job runner script** (`lib/runScheduledJobs.js`):
```javascript
// Reads data/intro-requests.json
// Finds all confirmed subscriptions
// Runs each job sequentially
// Calls scheduler.runPropertyIntelDaily() or scheduler.runFincaDaily()
```

4. **Enable timer**:
```bash
sudo systemctl enable panama-scraper-scheduler.timer
sudo systemctl start panama-scraper-scheduler.timer
```

**Pros**: 
- ✅ OS-level reliability (survives API restarts)
- ✅ Can view logs: `journalctl -u panama-scraper-scheduler`
- ✅ No code changes needed to existing scheduler logic

**Cons**:
- ❌ Requires EC2 instance to be running 24/7
- ❌ Single instance only

---

### Option 2: AWS EventBridge + Lambda/EC2

**Best for**: Cloud-native, scalable, serverless-friendly

**Architecture**:
- AWS EventBridge (CloudWatch Events) triggers on schedule
- Each subscription gets its own EventBridge rule
- Invokes Lambda function OR calls EC2 API endpoint
- EC2 API has endpoint: `POST /scheduler/run/:subscriptionId`

**Implementation**:

1. **When subscription is confirmed**, create EventBridge rule:
```javascript
// In api.js, when subscription confirmed:
import { EventBridgeClient, PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-eventbridge";

const client = new EventBridgeClient({ region: 'us-east-1' });

// Create rule
await client.send(new PutRuleCommand({
  Name: `panama-scraper-${subscriptionId}`,
  ScheduleExpression: `cron(0 9 * * ? *)`, // 9 AM Panama time (convert to UTC)
  State: 'ENABLED',
  Description: `Daily job for ${subscription.email}`
}));

// Add target (Lambda or API endpoint)
await client.send(new PutTargetsCommand({
  Rule: `panama-scraper-${subscriptionId}`,
  Targets: [{
    Id: '1',
    Arn: 'arn:aws:lambda:us-east-1:xxx:function:runScraper', // OR HTTP endpoint
    Input: JSON.stringify({ subscriptionId })
  }]
}));
```

2. **Store rule ARN in subscription data** for cleanup

**Pros**:
- ✅ Cloud-native, highly reliable
- ✅ Works across multiple EC2 instances
- ✅ Can use Lambda for serverless
- ✅ Built-in monitoring in CloudWatch

**Cons**:
- ❌ Requires AWS SDK integration
- ❌ Need to manage rule lifecycle (create/delete)
- ❌ Timezone conversion complexity

---

### Option 3: Separate Scheduler Service (EC2 + Redis/Database)

**Best for**: Multiple instances, need coordination

**Architecture**:
- Separate Node.js process running only scheduler
- Uses Redis or database for job coordination
- Uses `node-cron` but with distributed locking
- API stores job definitions, scheduler reads and executes

**Implementation**:

1. **Scheduler Service** (`lib/schedulerService.js`):
```javascript
import cron from 'node-cron';
import redis from 'redis';
import { listSubscriptionRequests } from './introPipelineStorage.js';

const client = redis.createClient();

// Every 5 minutes, check for jobs that need to run
cron.schedule('*/5 * * * *', async () => {
  const subscriptions = listSubscriptionRequests({ confirmed: true });
  const now = new Date();
  
  for (const sub of subscriptions) {
    const runTime = sub.runTime || '09:00';
    const [hour, minute] = runTime.split(':').map(Number);
    
    // Check if job should run now (within 5 min window)
    if (now.getHours() === hour && now.getMinutes() >= minute && now.getMinutes() < minute + 5) {
      // Try to acquire lock
      const lockKey = `job:${sub.id}:${now.toISOString().split('T')[0]}`;
      const locked = await client.set(lockKey, '1', { EX: 3600, NX: true });
      
      if (locked) {
        // We got the lock, run the job
        await runJob(sub);
      }
    }
  }
});
```

2. **Run as separate process**:
```bash
# systemd service for scheduler only
pm2 start lib/schedulerService.js --name scheduler
# OR
systemd service that runs schedulerService.js
```

**Pros**:
- ✅ Works with multiple instances
- ✅ Prevents duplicate runs
- ✅ Scheduler can restart independently of API

**Cons**:
- ❌ More complex architecture
- ❌ Requires Redis/database
- ❌ Still depends on process staying alive

---

### Option 4: Keep Current + Process Manager (Quick Fix)

**Best for**: Quick deployment, single instance, acceptable downtime

**Architecture**:
- Keep current `node-cron` implementation
- Use PM2 or systemd to auto-restart API on crash
- On restart, `initializeScheduler()` reloads all jobs

**Implementation**:

1. **Use PM2** to keep API running:
```bash
npm install -g pm2
pm2 start api.js --name panama-api
pm2 save
pm2 startup  # Auto-start on reboot
```

2. **Ensure `initializeScheduler()` always runs on startup** (already implemented)

**Pros**:
- ✅ Minimal changes needed
- ✅ Auto-recovery on crash

**Cons**:
- ❌ Jobs missed during downtime
- ❌ Still single-instance only
- ❌ No coordination between instances

---

## Recommended Approach for EC2

### For Single Instance (Simple)
**Use Option 1 (Systemd Timers)** or **Option 4 (PM2 + current code)**

### For Production/Multi-Instance
**Use Option 2 (AWS EventBridge)** for reliability and scalability

---

## Migration Path

1. **Phase 1**: Deploy with PM2 (Option 4) - gets you running quickly
2. **Phase 2**: Move to Systemd Timers (Option 1) - more reliable
3. **Phase 3**: Migrate to EventBridge (Option 2) - production-ready

---

## Current Code Status

✅ **Subscription data persists** to `data/intro-requests.json`
✅ **`initializeScheduler()` loads jobs on startup**
❌ **Cron jobs only exist in memory**
❌ **No coordination for multi-instance**

To make current code work on EC2:
1. Ensure API stays running (PM2/systemd)
2. Jobs will reload on restart (but may miss during downtime)
3. For production, migrate to one of the options above

