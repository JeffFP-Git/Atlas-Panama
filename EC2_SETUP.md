# EC2 Setup Guide

## Quick Setup on EC2

### Step 1: Clone Repository (if not already done)

```bash
# If you haven't cloned the repo yet
git clone <your-repo-url>
cd panama-scraper

# Or if you need to pull latest changes
git pull
```

### Step 2: Run Setup Script

```bash
# Make script executable (if needed)
chmod +x scripts/setup-ec2.sh

# Run setup
./scripts/setup-ec2.sh
```

The script will:
- Check for required files
- Install Docker if needed
- Create .env template if missing
- Verify everything is ready

### Step 3: Configure Environment

```bash
# Edit .env file with your credentials
nano .env
```

Required variables:
- `RP_USERNAME` - Your login username
- `RP_PASSWORD` - Your login password
- `SMTP_*` - Email configuration
- `CAPTCHA_API_KEY` - 2captcha API key (recommended)

### Step 4: Start API

```bash
# Build and start
docker compose up -d --build api

# Or if using older docker-compose command:
docker-compose up -d --build api

# View logs
docker compose logs -f api
```

### Step 5: Verify It's Working

```bash
# Check health endpoint
curl http://localhost:3000/health

# Check container status
docker compose ps

# View logs
docker compose logs api
```

---

## Manual Setup (if script doesn't work)

### Install Docker

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER

# Log out and back in for group changes
exit
# SSH back in
```

### Verify Docker

```bash
docker --version
docker compose version
```

### Start API

```bash
cd ~/panama-scraper
docker compose up -d --build api
```

---

## Troubleshooting

### "docker-compose.yml not found"

**Solution 1: Pull from Git**
```bash
git pull
```

**Solution 2: Copy files manually**
If you don't have git, you need to copy these files to EC2:
- `docker-compose.yml`
- `Dockerfile.api`
- `package.json`
- `package-lock.json`
- All files in `lib/` directory
- All files in `public/` directory

**Solution 3: Clone fresh**
```bash
cd ~
rm -rf panama-scraper  # Backup first if needed!
git clone <your-repo-url>
cd panama-scraper
```

### "Permission denied" for Docker

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in
exit
# SSH back in
```

### "Cannot connect to Docker daemon"

```bash
# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Check status
sudo systemctl status docker
```

### Container won't start

```bash
# Check logs
docker compose logs api

# Check if port 3000 is in use
sudo lsof -i :3000

# Restart container
docker compose restart api

# Rebuild from scratch
docker compose down
docker compose up -d --build api
```

### API not accessible from outside

**Check Security Group:**
1. Go to EC2 Console → Security Groups
2. Find your instance's security group
3. Add inbound rule:
   - Type: Custom TCP
   - Port: 3000 (or 80/443 if using Nginx)
   - Source: 0.0.0.0/0 (or your IP for testing)

**Test locally first:**
```bash
# On EC2
curl http://localhost:3000/health

# From your local machine
curl http://your-ec2-public-ip:3000/health
```

---

## Next Steps After API is Running

### Option 1: Access Directly

- API: `http://your-ec2-ip:3000`
- Dashboard: `http://your-ec2-ip:3000/subscribe.html`
- Health: `http://your-ec2-ip:3000/health`

### Option 2: Setup Nginx (Recommended)

See `docker/AWS_QUICK_START.md` for Nginx configuration to:
- Serve frontend files
- Proxy API requests
- Enable HTTPS with Let's Encrypt

---

## Useful Commands

```bash
# View running containers
docker compose ps

# View logs
docker compose logs -f api

# Restart API
docker compose restart api

# Stop API
docker compose down

# Rebuild after code changes
docker compose up -d --build api

# Execute command in container
docker compose exec api node --version

# View container resource usage
docker stats panama-scraper-api
```

---

## Auto-Start on Reboot

Create systemd service:

```bash
sudo nano /etc/systemd/system/panama-scraper.service
```

Add:
```ini
[Unit]
Description=Panama Scraper API
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/panama-scraper
ExecStart=/usr/bin/docker compose up -d api
ExecStop=/usr/bin/docker compose down
User=ubuntu
Group=ubuntu

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl enable panama-scraper
sudo systemctl start panama-scraper
```

