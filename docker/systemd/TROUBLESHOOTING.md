# Troubleshooting Systemd Services

## Service Failing with Exit Code 1 or 120

### Step 1: Check the Error Logs

```bash
# View the error log
tail -50 /home/ubuntu/panama-scraper/logs/systemd-finca-error.log

# View the output log
tail -50 /home/ubuntu/panama-scraper/logs/systemd-finca.log

# View systemd journal
journalctl -u panama-scraper-finca.service -n 50 --no-pager
```

### Step 2: Run Debug Script

```bash
cd ~/panama-scraper
./docker/systemd/debug-service.sh
```

This will test everything step by step and show you exactly where it's failing.

### Step 3: Common Issues and Fixes

#### Issue: Exit Code 120 - Docker Compose Error

**Symptoms:**
- Exit code 120
- Service fails immediately

**Causes:**
1. `docker-compose` not found in PATH
2. Docker not accessible
3. Missing `.env` file
4. `BUILDING_NAME` not set

**Fix:**
```bash
# Check if docker-compose exists
which docker-compose
# If not found, install it or use docker compose (v2)
sudo apt-get update
sudo apt-get install docker-compose

# Or use docker compose (newer version)
# Update service file to use: /usr/bin/docker compose instead of docker-compose
```

#### Issue: BUILDING_NAME Not Set

**Symptoms:**
- Service runs but fails with "name required" error

**Fix:**
```bash
# Check .env file
cat ~/panama-scraper/.env | grep BUILDING_NAME

# Add to .env if missing
echo "BUILDING_NAME=Your Company Name" >> ~/panama-scraper/.env

# Reload service
sudo systemctl daemon-reload
sudo systemctl restart panama-scraper-finca.timer
```

#### Issue: Docker Permission Denied

**Symptoms:**
- Permission errors in logs
- Exit code 1

**Fix:**
```bash
# Add user to docker group
sudo usermod -aG docker ubuntu
newgrp docker

# Verify
docker ps
```

#### Issue: Docker Images Not Built

**Symptoms:**
- "No such service" or "image not found" errors

**Fix:**
```bash
cd ~/panama-scraper
docker-compose build finca
docker-compose build mercantil
docker-compose build main
```

#### Issue: Wrong Paths in Service File

**Symptoms:**
- "No such file or directory" errors
- Service can't find project

**Fix:**
```bash
# Check actual project path
pwd

# Update service files if path is different
sudo nano /etc/systemd/system/panama-scraper-finca.service
# Update all paths to match your actual path

# Reload
sudo systemctl daemon-reload
```

### Step 4: Test Manually

```bash
# Test the exact command the service runs
cd /home/ubuntu/panama-scraper
source .env
docker-compose run --rm finca --name "${BUILDING_NAME}"
```

### Step 5: Check Service Configuration

```bash
# View service file
cat /etc/systemd/system/panama-scraper-finca.service

# Check if paths are correct
# Check if EnvironmentFile points to correct .env location
# Check if ExecStart command is correct
```

### Step 6: Reinstall Service

If all else fails, reinstall:

```bash
# Stop and disable
sudo systemctl stop panama-scraper-finca.timer
sudo systemctl disable panama-scraper-finca.timer

# Remove old files
sudo rm /etc/systemd/system/panama-scraper-*.service
sudo rm /etc/systemd/system/panama-scraper-*.timer

# Reinstall
cd ~/panama-scraper
sudo ./docker/systemd/install-systemd.sh
```

## Using Docker Compose v2

If your system uses `docker compose` (v2) instead of `docker-compose` (v1):

### Update Service Files

```bash
sudo nano /etc/systemd/system/panama-scraper-finca.service
```

Change:
```
ExecStart=/bin/bash -c 'cd /home/ubuntu/panama-scraper && /usr/bin/docker-compose run --rm finca --name "${BUILDING_NAME:-${SEARCH_PARAMETER}}" || exit 1'
```

To:
```
ExecStart=/bin/bash -c 'cd /home/ubuntu/panama-scraper && /usr/bin/docker compose run --rm finca --name "${BUILDING_NAME:-${SEARCH_PARAMETER}}" || exit 1'
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl restart panama-scraper-finca.timer
```

## Viewing Real-Time Logs

```bash
# Follow systemd logs
journalctl -u panama-scraper-finca.service -f

# Follow file logs
tail -f /home/ubuntu/panama-scraper/logs/systemd-finca.log
tail -f /home/ubuntu/panama-scraper/logs/systemd-finca-error.log

# Follow docker logs (if container is still running)
docker-compose logs -f finca
```

## Checking Service Status

```bash
# Check if timer is active
systemctl is-active panama-scraper-finca.timer

# Check timer status
systemctl status panama-scraper-finca.timer

# Check service status
systemctl status panama-scraper-finca.service

# List all timers
systemctl list-timers panama-scraper-*.timer
```

## Manual Testing

Before relying on the timer, always test manually:

```bash
# Test the service directly
sudo systemctl start panama-scraper-finca.service

# Watch it run
journalctl -u panama-scraper-finca.service -f

# Check exit code
echo $?
```

## Getting More Verbose Output

Edit the service file to add more debugging:

```bash
sudo nano /etc/systemd/system/panama-scraper-finca.service
```

Add before ExecStart:
```
ExecStartPre=/bin/bash -c 'echo "Starting finca scraper at $(date)" >> /home/ubuntu/panama-scraper/logs/systemd-finca.log'
ExecStartPre=/bin/bash -c 'echo "BUILDING_NAME=${BUILDING_NAME}" >> /home/ubuntu/panama-scraper/logs/systemd-finca.log'
```

Then reload:
```bash
sudo systemctl daemon-reload
```

