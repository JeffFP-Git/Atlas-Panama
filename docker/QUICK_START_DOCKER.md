# Quick Start: Docker Deployment

## Prerequisites

- Docker and Docker Compose installed
- `.env` file configured

## 1. Configure Environment

Create `.env` file:

```bash
cp .env.example .env
# Edit .env with your credentials
```

Minimum required variables:
```bash
RP_USERNAME=your_username
RP_PASSWORD=your_password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=1
SMTP_USER=your-email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=your-email@gmail.com
```

## 2. Build and Start

```bash
# Build and start API server
docker-compose up -d --build api

# Check logs
docker-compose logs -f api
```

## 3. Access the Application

- **API**: http://localhost:3000
- **Dashboard**: http://localhost:3000/subscribe.html
- **Health**: http://localhost:3000/health

## 4. Common Commands

```bash
# Start API
docker-compose up -d api

# Stop API
docker-compose down

# View logs
docker-compose logs -f api

# Restart API
docker-compose restart api

# Rebuild after code changes
docker-compose up -d --build api

# Execute command in container
docker-compose exec api node lib/introFincaPipeline.js --name "Test Company"
```

## 5. Verify It's Working

```bash
# Check health
curl http://localhost:3000/health

# Check container status
docker-compose ps

# Check logs for errors
docker-compose logs api | grep -i error
```

## Troubleshooting

**API won't start?**
- Check logs: `docker-compose logs api`
- Verify `.env` file exists and has all required variables
- Check if port 3000 is already in use: `lsof -i :3000`

**Chrome errors?**
- Already handled in Dockerfile
- Check logs for specific Puppeteer errors

**Email not working?**
- Try port 465 with SSL: `SMTP_PORT=465 SMTP_SECURE=1`
- Check VPN settings if using VPN
- Verify SMTP credentials

For detailed deployment guide, see `docker/DEPLOYMENT.md`

