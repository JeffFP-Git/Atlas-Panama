# Docker Deployment Guide

Complete guide for deploying the Panama Scraper system with Docker.

## Quick Start

### 1. Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- `.env` file configured with all required variables

### 2. Basic Deployment

```bash
# Build and start the API server
docker-compose up -d api

# View logs
docker-compose logs -f api

# Stop the API
docker-compose down
```

### 3. Access the API

- **API**: http://localhost:3000
- **Dashboard**: http://localhost:3000/subscribe.html
- **Health Check**: http://localhost:3000/health

## Architecture

### Services

1. **`api`** - Main API server (always running)
   - Express.js API server
   - Web interface for subscriptions
   - Job scheduling with `node-cron`
   - Handles all scraping jobs

2. **`finca`** - Finca scraper (profile: `finca`)
   - Runs on-demand or via cron

3. **`mercantil`** - Mercantil scraper (profile: `mercantil`)
   - Runs on-demand or via cron

4. **`main`** - Main property scraper (profile: `main`)
   - Runs on-demand or via cron

5. **`all`** - Runs all scrapers in sequence (profile: `all`)
   - For manual full runs

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Required
RP_USERNAME=your_username
RP_PASSWORD=your_password

# Email (Required for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=1
SMTP_USER=your-email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=your-email@gmail.com

# CAPTCHA (Recommended for production)
CAPTCHA_PROVIDER=2captcha
CAPTCHA_API_KEY=your_2captcha_api_key
CAPTCHA_PLUGIN=1

# API Configuration
PORT=3000
MAX_CONCURRENCY=2
MAX_QUEUE=1000

# Scheduler
DAILY_RUN_TIME=09:00

# Email Recipients
FINCA_EMAIL_RECIPIENTS=recipient1@example.com,recipient2@example.com
ALERT_EMAILS=alerts@example.com
```

### Volume Mounts

The following directories are persisted as volumes:

- `./BuildingData` - Output Excel files
- `./debug-output` - Debug screenshots and HTML
- `./session` - Session cookies
- `./data` - Subscription data (JSON)
- `./logs` - Application logs

## Deployment Scenarios

### Scenario 1: API Server Only (Recommended)

```bash
# Start API server
docker-compose up -d api

# View logs
docker-compose logs -f api

# Restart after changes
docker-compose restart api

# Rebuild after code changes
docker-compose up -d --build api
```

### Scenario 2: API + Scheduled Jobs

The API includes built-in scheduling with `node-cron`. When subscriptions are confirmed, they are automatically scheduled.

**Note**: For production, consider using external schedulers (EventBridge, systemd timers) as described in `docs/SCHEDULING_ARCHITECTURE.md`.

### Scenario 3: On-Demand Scrapers

Run individual scrapers manually:

```bash
# Run finca scraper
docker-compose run --rm finca --name "Company Name"

# Run main scraper
docker-compose run --rm main

# Run all scrapers
docker-compose --profile all run --rm all
```

## Production Deployment

### 1. EC2 Deployment

```bash
# SSH into EC2
ssh ec2-user@your-ec2-instance

# Clone repository
git clone <your-repo-url>
cd panama-scraper

# Create .env file
nano .env
# (paste your environment variables)

# Start API
docker-compose up -d api

# Enable auto-start on reboot (systemd)
sudo nano /etc/systemd/system/panama-scraper.service
```

**systemd service file** (`/etc/systemd/system/panama-scraper.service`):

```ini
[Unit]
Description=Panama Scraper API
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ec2-user/panama-scraper
ExecStart=/usr/bin/docker-compose up -d api
ExecStop=/usr/bin/docker-compose down
User=ec2-user
Group=ec2-user

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable panama-scraper
sudo systemctl start panama-scraper
```

### 2. Using Docker Swarm (Multi-Instance)

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml panama-scraper

# Scale API
docker service scale panama-scraper_api=2
```

### 3. Using Kubernetes

See `k8s/` directory for Kubernetes manifests (create if needed).

## Monitoring

### Health Checks

The API includes a health endpoint:

```bash
curl http://localhost:3000/health
```

Docker Compose automatically monitors this and restarts if unhealthy.

### Logs

```bash
# All logs
docker-compose logs

# API logs only
docker-compose logs api

# Follow logs
docker-compose logs -f api

# Last 100 lines
docker-compose logs --tail=100 api
```

### Resource Usage

```bash
# Container stats
docker stats panama-scraper-api

# Disk usage
docker system df
```

## Troubleshooting

### API Won't Start

1. **Check logs**:
   ```bash
   docker-compose logs api
   ```

2. **Verify environment variables**:
   ```bash
   docker-compose config
   ```

3. **Check port availability**:
   ```bash
   netstat -tulpn | grep 3000
   ```

### Chrome/Puppeteer Issues

If you see Chrome errors:

1. **Check Chrome installation in container**:
   ```bash
   docker-compose exec api /usr/bin/google-chrome-stable --version
   ```

2. **Verify PUPPETEER_EXECUTABLE_PATH**:
   ```bash
   docker-compose exec api echo $PUPPETEER_EXECUTABLE_PATH
   ```

### Email Not Sending

1. **Test SMTP connection**:
   ```bash
   docker-compose exec api node -e "import('./lib/email.js').then(m => m.testEmailConfig())"
   ```

2. **Check VPN/proxy settings** - see `lib/email.js` for VPN configuration

3. **Use port 465 with SSL**:
   ```bash
   SMTP_PORT=465 SMTP_SECURE=1 docker-compose up -d api
   ```

### Data Persistence

Ensure volumes are properly mounted:

```bash
# Check volume mounts
docker-compose exec api ls -la /app/data
docker-compose exec api ls -la /app/BuildingData
```

### Permissions Issues

If you see permission errors:

```bash
# Fix ownership (on host)
sudo chown -R $USER:$USER BuildingData data logs session debug-output

# Or run container as your user
docker-compose exec -u $(id -u):$(id -g) api ls -la
```

## Updating the Application

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose up -d --build api

# Or rebuild specific service
docker-compose build api
docker-compose up -d api
```

## Security Considerations

1. **Never commit `.env` file** - Already in `.gitignore`

2. **Use Docker secrets** (for Docker Swarm):
   ```yaml
   secrets:
     rp_password:
       external: true
   ```

3. **Limit exposed ports** - Only expose port 3000 if needed

4. **Use reverse proxy** - Nginx/Traefik in front of API

5. **Enable HTTPS** - Use Let's Encrypt with reverse proxy

## Backup

Backup persistent data:

```bash
# Create backup
tar -czf backup-$(date +%Y%m%d).tar.gz BuildingData data session logs

# Restore backup
tar -xzf backup-YYYYMMDD.tar.gz
```

## Cleanup

```bash
# Stop and remove containers
docker-compose down

# Remove volumes (WARNING: deletes data)
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Clean up Docker system
docker system prune -a
```

## Advanced: Custom Network

If you need custom networking:

```yaml
networks:
  panama-scraper-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

## Support

- Check logs: `docker-compose logs -f api`
- Health check: `curl http://localhost:3000/health`
- API docs: Available at `/api` endpoint (if implemented)

