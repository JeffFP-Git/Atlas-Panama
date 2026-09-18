# Setting Up Scheduled Tasks on EC2

This guide shows you how to set up the Panama Scraper to run automatically on your EC2 instance, even when you disconnect from VS Code.

## Prerequisites

1. EC2 instance with Docker and docker-compose installed
2. Your project cloned to the EC2 instance (e.g., `/home/ubuntu/panama-scraper`)
3. `.env` file configured with your credentials
4. Docker permissions fixed (user in docker group)

## Option 1: Systemd Timers (Recommended)

Systemd timers are the modern, robust way to schedule tasks on Linux. They:
- Run even when you're disconnected
- Survive reboots
- Provide better logging and monitoring
- Can be managed with standard systemctl commands

### Step 1: Install the Services

On your EC2 instance, run:

```bash
cd ~/panama-scraper
sudo ./docker/systemd/install-systemd.sh
```

This will:
- Copy service and timer files to `/etc/systemd/system/`
- Enable the timers to start on boot
- Start the timers immediately

### Step 2: Verify Installation

```bash
# Check timer status
systemctl list-timers panama-scraper-*.timer

# Check service status
systemctl status panama-scraper-finca.service
```

### Step 3: Test Manually

```bash
# Manually trigger a run to test
sudo systemctl start panama-scraper-finca.service

# Watch the logs
journalctl -u panama-scraper-finca.service -f
# Or
tail -f ~/panama-scraper/logs/systemd-finca.log
```

### Schedule

By default, the services run:
- **Finca**: 9:00 PM daily
- **Mercantil**: 9:15 PM daily  
- **Main**: 9:30 PM daily

### Useful Commands

```bash
# View all timer status
systemctl list-timers panama-scraper-*.timer

# View service logs
journalctl -u panama-scraper-finca.service -n 50
journalctl -u panama-scraper-finca.service -f  # Follow logs

# View file logs
tail -f ~/panama-scraper/logs/systemd-finca.log

# Manually trigger a run
sudo systemctl start panama-scraper-finca.service

# Disable a timer
sudo systemctl disable panama-scraper-finca.timer
sudo systemctl stop panama-scraper-finca.timer

# Re-enable a timer
sudo systemctl enable panama-scraper-finca.timer
sudo systemctl start panama-scraper-finca.timer
```

### Changing the Schedule

Edit the timer files:

```bash
sudo nano /etc/systemd/system/panama-scraper-finca.timer
```

Change the `OnCalendar` line:
- `OnCalendar=*-*-* 21:00:00` = 9 PM daily
- `OnCalendar=*-*-* 09:00:00` = 9 AM daily
- `OnCalendar=Mon-Fri 21:00:00` = 9 PM weekdays only
- `OnCalendar=*-*-1 21:00:00` = 9 PM on the 1st of every month

Then reload:
```bash
sudo systemctl daemon-reload
sudo systemctl restart panama-scraper-finca.timer
```

## Option 2: Cron (Alternative)

If you prefer cron, you can use it instead:

### Step 1: Create Cron Jobs

```bash
crontab -e
```

Add these lines (adjust paths as needed):

```cron
# Finca scraper - 9 PM daily
0 21 * * * cd /home/ubuntu/panama-scraper && /usr/bin/docker-compose run --rm finca --name "${BUILDING_NAME}" >> logs/cron-finca.log 2>&1

# Mercantil scraper - 9:15 PM daily
15 21 * * * cd /home/ubuntu/panama-scraper && /usr/bin/docker-compose run --rm mercantil --name "${BUILDING_NAME}" >> logs/cron-mercantil.log 2>&1

# Main pipeline - 9:30 PM daily
30 21 * * * cd /home/ubuntu/panama-scraper && /usr/bin/docker-compose run --rm main --building "${BUILDING_NAME}" >> logs/cron-main.log 2>&1
```

**Note:** Cron doesn't automatically load `.env` variables. You may need to source them or use a wrapper script.

### Step 2: Create Wrapper Script (for cron)

Create `~/panama-scraper/docker/run-finca-cron.sh`:

```bash
#!/bin/bash
cd /home/ubuntu/panama-scraper
source .env
/usr/bin/docker-compose run --rm finca --name "${BUILDING_NAME}"
```

Make it executable:
```bash
chmod +x ~/panama-scraper/docker/run-finca-cron.sh
```

Then update crontab to use the script:
```cron
0 21 * * * /home/ubuntu/panama-scraper/docker/run-finca-cron.sh >> /home/ubuntu/panama-scraper/logs/cron-finca.log 2>&1
```

## Option 3: Docker with Cron Container

You can also run a cron container that schedules the other containers:

```yaml
# Add to docker-compose.yml
services:
  cron:
    image: alpine:latest
    volumes:
      - ./docker/crontab:/etc/cron.d/panama-scraper:ro
      - ./:/app:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: crond -f -d 8
    restart: unless-stopped
```

This is more complex and generally not recommended unless you want everything containerized.

## Monitoring

### Check if Services are Running

```bash
# Systemd timers
systemctl list-timers panama-scraper-*.timer

# Cron jobs
crontab -l

# Docker containers
docker ps -a
```

### View Logs

```bash
# Systemd logs
journalctl -u panama-scraper-finca.service --since "1 hour ago"

# File logs
tail -f ~/panama-scraper/logs/systemd-finca.log
tail -f ~/panama-scraper/logs/systemd-finca-error.log

# Docker logs (if containers are still running)
docker-compose logs finca
```

### Check Last Run

```bash
# Systemd
systemctl status panama-scraper-finca.service

# Check output files
ls -lth ~/panama-scraper/BuildingData/*.xlsx | head -5
```

## Troubleshooting

### Service Not Running

1. **Check if timer is active:**
   ```bash
   systemctl is-active panama-scraper-finca.timer
   ```

2. **Check service status:**
   ```bash
   systemctl status panama-scraper-finca.service
   ```

3. **Check logs:**
   ```bash
   journalctl -u panama-scraper-finca.service -n 100
   ```

### Permission Issues

Make sure:
- User is in docker group: `groups | grep docker`
- Docker socket is accessible: `ls -l /var/run/docker.sock`
- Project directory is owned by the service user

### Environment Variables Not Loading

Systemd services load from `.env` file automatically. If variables aren't working:
1. Check `.env` file exists and has correct path in service file
2. Check service file has `EnvironmentFile=` line
3. Restart service: `sudo systemctl restart panama-scraper-finca.service`

## Disabling/Removing

### Disable Systemd Timers

```bash
sudo systemctl disable panama-scraper-finca.timer
sudo systemctl stop panama-scraper-finca.timer
sudo systemctl disable panama-scraper-mercantil.timer
sudo systemctl stop panama-scraper-mercantil.timer
sudo systemctl disable panama-scraper-main.timer
sudo systemctl stop panama-scraper-main.timer
```

### Remove Systemd Services

```bash
sudo systemctl disable panama-scraper-*.timer
sudo systemctl stop panama-scraper-*.timer
sudo rm /etc/systemd/system/panama-scraper-*.service
sudo rm /etc/systemd/system/panama-scraper-*.timer
sudo systemctl daemon-reload
```

## Best Practices

1. **Test manually first** before enabling timers
2. **Monitor logs** for the first few days
3. **Set up log rotation** to prevent disk space issues
4. **Use systemd timers** over cron for better integration
5. **Keep .env file secure** (don't commit to git)
6. **Set up alerts** (email, SNS, etc.) for failures

## Log Rotation

To prevent logs from growing too large, set up log rotation:

```bash
sudo nano /etc/logrotate.d/panama-scraper
```

Add:
```
/home/ubuntu/panama-scraper/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 ubuntu ubuntu
}
```

