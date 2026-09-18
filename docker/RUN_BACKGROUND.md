# Running Pipeline in Background on EC2

This guide shows you how to start a pipeline run on EC2 and disconnect from the terminal without stopping the process.

## Quick Options Summary

| Method | Best For | Complexity |
|--------|----------|------------|
| **nohup** | One-off manual runs | ⭐ Simple |
| **screen/tmux** | Interactive monitoring | ⭐⭐ Medium |
| **systemd (oneshot)** | Production, reliable | ⭐⭐⭐ Advanced |
| **disown** | Quick detach | ⭐ Simple |

---

## Option 1: Using `nohup` (Simplest)

`nohup` runs a command immune to hangups, so it continues even after you disconnect.

### Step 1: Start the Pipeline

```bash
# Main scraper
nohup docker-compose --profile main run --rm main --building "Ocean Waves" > logs/manual-main.log 2>&1 &

# Finca scraper
nohup docker-compose --profile finca run --rm finca --name "Company Name" > logs/manual-finca.log 2>&1 &

# Mercantil scraper
nohup docker-compose --profile mercantil run --rm mercantil > logs/manual-mercantil.log 2>&1 &
```

The `&` at the end runs it in the background, and `nohup` ensures it keeps running after you disconnect.

### Step 2: Check if it's Running

```bash
# Check running processes
ps aux | grep docker-compose

# Or check Docker containers
docker ps
```

### Step 3: Monitor Progress

```bash
# Watch the log file in real-time
tail -f logs/manual-main.log

# Or check the last 50 lines
tail -n 50 logs/manual-main.log
```

### Step 4: Disconnect Safely

You can now:
- Close your terminal
- Disconnect from SSH
- Close VS Code

The process will continue running.

### Finding the Process ID

```bash
# Find the process
ps aux | grep "docker-compose.*main"

# Kill it if needed (use the PID from above)
kill <PID>
```

---

## Option 2: Using `screen` (Recommended for Monitoring)

`screen` creates a virtual terminal that persists after disconnection. You can reconnect later to see the output.

### Step 1: Install screen (if not installed)

```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y screen

# Amazon Linux
sudo yum install -y screen
```

### Step 2: Start a Screen Session

```bash
# Start a new screen session named "scraper"
screen -S scraper

# You'll see a new terminal. Now run your command:
cd ~/panama-scraper
docker-compose --profile main run --rm main --building "Ocean Waves"
```

### Step 3: Detach from Screen

Press: `Ctrl+A` then `D` (hold Ctrl, press A, release, press D)

You'll see: `[detached from <session-id>]`

### Step 4: Disconnect from SSH

You can now safely disconnect. The process continues running.

### Step 5: Reconnect Later

```bash
# List all screen sessions
screen -ls

# Reattach to the session
screen -r scraper

# If multiple sessions, specify the ID
screen -r <session-id>
```

### Useful Screen Commands

- `Ctrl+A` then `D` - Detach from screen
- `Ctrl+A` then `K` - Kill current window (type 'y' to confirm)
- `screen -ls` - List all sessions
- `screen -r <name>` - Reattach to session
- `screen -S <name>` - Start named session
- `exit` - Exit screen (kills session)

---

## Option 3: Using `tmux` (Alternative to screen)

`tmux` is similar to screen but with more features.

### Step 1: Install tmux (if not installed)

```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y tmux

# Amazon Linux
sudo yum install -y tmux
```

### Step 2: Start a tmux Session

```bash
# Start a new tmux session
tmux new -s scraper

# Or if tmux is already running, create new window
tmux new-window -n scraper

# Run your command
cd ~/panama-scraper
docker-compose --profile main run --rm main --building "Ocean Waves"
```

### Step 3: Detach from tmux

Press: `Ctrl+B` then `D`

### Step 4: Reconnect Later

```bash
# List sessions
tmux ls

# Reattach
tmux attach -t scraper
```

### Useful tmux Commands

- `Ctrl+B` then `D` - Detach
- `Ctrl+B` then `X` - Kill current pane
- `tmux ls` - List sessions
- `tmux attach -t <name>` - Reattach
- `tmux kill-session -t <name>` - Kill session

---

## Option 4: Using `disown` (Quick Detach)

If you've already started a process, you can detach it with `disown`.

### Step 1: Start Process in Background

```bash
# Start with & to run in background
docker-compose --profile main run --rm main --building "Ocean Waves" > logs/manual-main.log 2>&1 &

# Note the job number (e.g., [1] 12345)
```

### Step 2: Disown the Process

```bash
# Disown the most recent background job
disown

# Or disown a specific job number
disown %1
```

### Step 3: Disconnect

You can now disconnect. The process will continue.

---

## Option 5: Using systemd (One-time Run)

For production use, you can trigger a systemd service manually without scheduling.

### Step 1: Install systemd Services (if not already)

```bash
cd ~/panama-scraper
sudo ./docker/systemd/install-systemd.sh
```

### Step 2: Run Service Manually

```bash
# Start the service (runs once)
sudo systemctl start panama-scraper-main.service

# Check status
sudo systemctl status panama-scraper-main.service

# View logs
journalctl -u panama-scraper-main.service -f
```

### Step 3: Disconnect

The service runs independently of your session. You can disconnect safely.

---

## Option 6: Docker Detached Mode

If you're running Docker containers directly (not via docker-compose run):

```bash
# Start container in detached mode
docker-compose up -d main

# Or for a one-time run that stays running
docker-compose run -d --rm main --building "Ocean Waves"

# Check logs
docker-compose logs -f main

# Stop when done
docker-compose stop main
```

**Note:** `docker-compose run --rm` removes the container when it exits, so detached mode may not work as expected. Use `nohup` or `screen` with `docker-compose run` instead.

---

## Monitoring Your Background Process

### Check if Process is Running

```bash
# Check Docker containers
docker ps

# Check processes
ps aux | grep docker-compose

# Check systemd services
systemctl status panama-scraper-main.service
```

### View Logs

```bash
# If using nohup
tail -f logs/manual-main.log

# If using systemd
journalctl -u panama-scraper-main.service -f

# If using screen/tmux
screen -r scraper  # or tmux attach -t scraper

# Docker logs
docker-compose logs -f main
```

### Check Output Files

```bash
# List output files
ls -lh BuildingData/

# Check latest file
ls -lt BuildingData/ | head -5
```

---

## Stopping a Background Process

### If using nohup/disown

```bash
# Find the process
ps aux | grep "docker-compose.*main"

# Kill it
kill <PID>

# Or kill all docker-compose processes (be careful!)
pkill -f "docker-compose.*main"
```

### If using screen

```bash
# Reattach
screen -r scraper

# Press Ctrl+C to stop, or Ctrl+A then K to kill
```

### If using tmux

```bash
# Reattach
tmux attach -t scraper

# Press Ctrl+C to stop
```

### If using systemd

```bash
# Stop the service
sudo systemctl stop panama-scraper-main.service
```

### If using Docker

```bash
# Stop container
docker-compose stop main

# Or kill specific container
docker kill <container-id>
```

---

## Best Practices

### 1. Always Redirect Output

```bash
# Good - logs saved to file
nohup command > logs/output.log 2>&1 &

# Bad - output lost
nohup command &
```

### 2. Use Log Rotation

For long-running processes, consider log rotation:

```bash
# Install logrotate config
sudo nano /etc/logrotate.d/panama-scraper
```

Add:
```
/home/ubuntu/panama-scraper/logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

### 3. Set Up Monitoring

```bash
# Create a simple monitoring script
cat > ~/check-scraper.sh << 'EOF'
#!/bin/bash
if ! pgrep -f "docker-compose.*main" > /dev/null; then
    echo "Scraper is not running!"
    # Optionally send alert email
fi
EOF

chmod +x ~/check-scraper.sh

# Add to crontab to check every hour
crontab -e
# Add: 0 * * * * /home/ubuntu/check-scraper.sh
```

### 4. Use systemd for Production

For production environments, systemd services are the most reliable:
- Automatic restarts on failure
- Better logging
- Survives reboots
- Can be monitored with standard tools

---

## Troubleshooting

### Process Dies After Disconnect

**Problem:** Process stops when you disconnect.

**Solution:** Make sure you're using `nohup`, `screen`, `tmux`, or `disown`. Regular background processes (`&`) will die when the shell exits.

### Can't Find the Process

```bash
# Check all Docker processes
docker ps -a

# Check system processes
ps aux | grep -E "docker|scraper"

# Check systemd
systemctl list-units | grep panama
```

### Logs Not Updating

```bash
# Make sure logs directory exists and is writable
mkdir -p ~/panama-scraper/logs
chmod 755 ~/panama-scraper/logs

# Check disk space
df -h

# Check file permissions
ls -la ~/panama-scraper/logs/
```

### Process Using Too Much Resources

```bash
# Check resource usage
top
htop  # if installed

# Limit Docker resources in docker-compose.yml
services:
  main:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

---

## Quick Reference

### Start and Disconnect (nohup)
```bash
nohup docker-compose --profile main run --rm main --building "Ocean Waves" > logs/main.log 2>&1 &
```

### Start and Disconnect (screen)
```bash
screen -S scraper
docker-compose --profile main run --rm main --building "Ocean Waves"
# Press Ctrl+A then D to detach
```

### Check Status
```bash
ps aux | grep docker-compose
docker ps
tail -f logs/main.log
```

### Reconnect (screen)
```bash
screen -r scraper
```

### Stop Process
```bash
pkill -f "docker-compose.*main"
# Or find PID and kill
ps aux | grep docker-compose
kill <PID>
```

