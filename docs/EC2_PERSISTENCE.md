# EC2 Persistence and Data Safety

## ✅ Good News: Subscriptions ARE Persisted

**Subscriptions are stored on disk** in `data/intro-requests.json` and will survive API restarts.

## How It Works

### 1. **Subscriptions Storage**
- **Location:** `data/intro-requests.json` (relative to project root)
- **Format:** JSON file with all subscription data
- **Persistence:** ✅ Survives API restarts, server reboots, etc.

### 2. **Automatic Reload on Startup**
When the API starts, it automatically:
1. Loads all confirmed subscriptions from `data/intro-requests.json`
2. Reschedules all daily jobs for confirmed subscriptions
3. Logs how many subscriptions were reloaded

**Code location:** `api.js` → `initializeScheduler()`

## ⚠️ Critical EC2 Considerations

### 1. **Data Directory Must Persist**

The `data/` directory must be on persistent storage, NOT ephemeral storage.

**Check your EC2 setup:**
```bash
# On EC2, verify where data/ is located
ls -la data/
df -h .  # Check if on ephemeral or EBS volume
```

**If using Docker:**
- Mount `data/` as a volume
- Use EBS volume, not instance store

**If using systemd service:**
- Ensure `data/` is on EBS volume
- Consider using `/opt/panama-scraper/data` or similar persistent path

### 2. **Backup Strategy (CRITICAL)**

Since this is production-critical, implement backups:

**Option A: Automated S3 Backup**
```bash
# Add to cron (runs daily at 2 AM)
0 2 * * * aws s3 cp /path/to/panama-scraper/data/intro-requests.json s3://your-backup-bucket/subscriptions/$(date +\%Y-\%m-\%d)-intro-requests.json
```

**Option B: Git-based Backup** (if using git)
```bash
# Add data/intro-requests.json to git (but be careful with sensitive data)
git add data/intro-requests.json
git commit -m "Backup subscriptions"
```

**Option C: Database Migration** (future improvement)
- Consider migrating to a database (PostgreSQL, DynamoDB, etc.)
- More reliable than JSON files for production

### 3. **Test Restart Recovery**

**Before going to production, test:**

```bash
# 1. Create a test subscription
curl -X POST http://localhost:3000/subscribe/submit ...

# 2. Confirm it
curl -X POST http://localhost:3000/subscribe/request/ID/confirm ...

# 3. Verify it's scheduled
curl http://localhost:3000/scheduler/list

# 4. Kill the API
pkill -f "node.*api.js"  # or however you're running it

# 5. Restart the API
node api.js  # or your startup command

# 6. Check logs - should see:
#    [API] Found X confirmed subscriptions
#    [API] Loaded X confirmed subscriptions for daily scheduling

# 7. Verify it's still scheduled
curl http://localhost:3000/scheduler/list
```

## Current Limitations

### 1. **In-Memory Job Tracking**
- Active cron jobs are stored in memory (`activeJobs` Map)
- These are **lost on restart** but **automatically recreated** from storage
- ✅ **This is fine** - jobs are recreated from confirmed subscriptions

### 2. **Test Jobs**
- Test jobs (scheduled via `/scheduler/test`) are **in-memory only**
- These are **lost on restart** and **not recreated**
- ✅ **This is fine** - test jobs are temporary by design

### 3. **No Backup by Default**
- The JSON file is the single source of truth
- ⚠️ **You must implement backups** for production

## Recommended Production Setup

### 1. **Use EBS Volume for Data**
```bash
# Mount EBS volume to /data
sudo mkdir -p /data/panama-scraper
sudo mount /dev/xvdf /data/panama-scraper
# Update your app to use /data/panama-scraper/data/
```

### 2. **Set Up Automated Backups**
```bash
# Create backup script
cat > /usr/local/bin/backup-subscriptions.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y-%m-%d-%H%M%S)
aws s3 cp /path/to/data/intro-requests.json \
  s3://your-backup-bucket/subscriptions/${DATE}-intro-requests.json
# Keep only last 30 days
aws s3 ls s3://your-backup-bucket/subscriptions/ | \
  awk '{print $4}' | sort -r | tail -n +31 | \
  xargs -I {} aws s3 rm s3://your-backup-bucket/subscriptions/{}
EOF

chmod +x /usr/local/bin/backup-subscriptions.sh

# Add to crontab
crontab -e
# Add: 0 2 * * * /usr/local/bin/backup-subscriptions.sh
```

### 3. **Monitor Data File**
```bash
# Add health check that verifies data file exists
# Add to your monitoring/alerting system
```

### 4. **Use systemd Service** (recommended)
```ini
[Unit]
Description=Panama Scraper API
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/panama-scraper
ExecStart=/usr/bin/node api.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

This ensures:
- API auto-restarts on crash
- Subscriptions are reloaded on restart
- Service survives reboots

## Verification Checklist

Before production deployment:

- [ ] Data directory is on EBS volume (persistent)
- [ ] Tested API restart - subscriptions reload correctly
- [ ] Automated backups configured
- [ ] Backup restoration tested
- [ ] Monitoring/alerting for data file
- [ ] systemd service configured (or equivalent)
- [ ] Logs show successful reload on startup

## Recovery Procedure

If subscriptions are lost:

1. **Check backups:**
   ```bash
   aws s3 ls s3://your-backup-bucket/subscriptions/
   ```

2. **Restore latest backup:**
   ```bash
   aws s3 cp s3://your-backup-bucket/subscriptions/LATEST.json \
     data/intro-requests.json
   ```

3. **Restart API:**
   ```bash
   sudo systemctl restart panama-scraper-api
   ```

4. **Verify:**
   ```bash
   curl http://localhost:3000/scheduler/list | jq
   ```

## Summary

✅ **Subscriptions persist** - stored in `data/intro-requests.json`  
✅ **Auto-reload on startup** - confirmed subscriptions are rescheduled  
⚠️ **Backups required** - implement S3 or other backup solution  
⚠️ **Use EBS volume** - ensure data directory is on persistent storage  

The system is designed to survive restarts, but you must ensure:
1. Data directory is on persistent storage (EBS)
2. Automated backups are configured
3. You've tested the restart recovery process


