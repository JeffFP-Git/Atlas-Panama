# Docker Setup for Panama Scraper

This directory contains Docker configurations for running the finca, mercantil, and main pipeline scrapers.

## Quick Start

### Prerequisites

1. Install Docker and Docker Compose
2. Create a `.env` file in the project root with required variables:
   ```bash
   RP_USERNAME=your_email@example.com
   RP_PASSWORD=your_password
   BUILDING_NAME=Your Building Name
   HEADLESS=1
   CAPTCHA_API_KEY=your_key_if_needed
   ```

### Build Images

```bash
# Build all images
docker-compose build

# Or build individually
docker-compose build finca
docker-compose build mercantil
docker-compose build main
```

### Run Individual Services

```bash
# Run finca scraper
docker-compose run --rm finca --name "Company Name"

# Run mercantil scraper
docker-compose run --rm mercantil --name "Company Name"

# Run main pipeline
docker-compose run --rm main --building "Building Name"
```

### Run All Services in Sequence

```bash
# Using the all service (requires custom entrypoint)
docker-compose run --rm all

# Or manually run each
docker-compose run --rm finca --name "Company Name" && \
docker-compose run --rm mercantil --name "Company Name" && \
docker-compose run --rm main --building "Building Name"
```

## Dockerfiles

- **Dockerfile.finca** - Finca scraper container
- **Dockerfile.mercantil** - Mercantil scraper container
- **Dockerfile.main** - Main pipeline scraper container

All Dockerfiles:
- Use Node.js 20 on Debian Bullseye
- Install Google Chrome/Chromium for Puppeteer
- Mount volumes for data persistence (BuildingData, logs, session, etc.)
- Run in headless mode by default

## Volumes

The containers mount these directories:
- `./BuildingData` - Excel output files
- `./debug-output` - Debug screenshots and HTML
- `./session` - Session cookies for authentication
- `./logs` - Log files
- `./downloads` - Downloaded files (main only)
- `./.env` - Environment variables (read-only)

## Environment Variables

All services support these environment variables (from `.env`):
- `RP_USERNAME` - Registry username (required)
- `RP_PASSWORD` - Registry password (required)
- `BUILDING_NAME` - Building name for scraping
- `SEARCH_PARAMETER` - Alternative search parameter
- `HEADLESS` - Run in headless mode (default: 1)
- `CAPTCHA_API_KEY` - CAPTCHA solver API key (optional)
- `CAPTCHA_PROVIDER` - CAPTCHA provider (optional)
- `CAPTCHA_PLUGIN` - Enable CAPTCHA plugin (0 or 1)

## Scheduling with Docker

### Option 1: Docker with Cron (Mac/Linux)

Create a cron job that runs docker-compose:

```bash
# Add to crontab (crontab -e)
0 21 * * * cd /path/to/panama-scraper && docker-compose run --rm finca --name "Company Name" >> logs/cron.log 2>&1
```

### Option 2: Docker Compose with Restart Policies

Edit `docker-compose.yml` to use restart policies, but note that containers need to be started manually or via a scheduler.

### Option 3: Use a Cron Container

You can add a cron service to docker-compose.yml that runs the scrapers on a schedule.

## Troubleshooting

### Container can't find Chrome

The Dockerfiles install Chrome/Chromium automatically. If you see errors, check:
- The container architecture matches your system
- Chrome is installed: `docker-compose run --rm finca google-chrome-stable --version`

### Permission Issues

If you see permission errors with mounted volumes:
```bash
# Fix ownership (Mac/Linux)
sudo chown -R $USER:$USER BuildingData logs session
```

### View Logs

```bash
# View container logs
docker-compose logs finca
docker-compose logs mercantil
docker-compose logs main

# Or check mounted log directory
ls -la logs/
```

### Debug Mode

To run with debug output:
```bash
docker-compose run --rm finca --name "Company Name" --debug=1 --headless=0
```

Note: `--headless=0` requires X11 forwarding or a display server.

### Clean Up

```bash
# Remove containers
docker-compose down

# Remove images
docker-compose down --rmi all

# Remove volumes (WARNING: deletes data)
docker-compose down -v
```

## Building for Different Architectures

```bash
# Build for ARM64 (Apple Silicon)
docker buildx build --platform linux/arm64 -f Dockerfile.finca -t panama-scraper-finca:arm64 .

# Build for AMD64
docker buildx build --platform linux/amd64 -f Dockerfile.finca -t panama-scraper-finca:amd64 .
```

## Production Deployment

For production, consider:
1. Using Docker secrets for sensitive data instead of `.env`
2. Setting up proper logging aggregation
3. Using a container orchestration platform (Kubernetes, Docker Swarm)
4. Setting resource limits in docker-compose.yml
5. Using health checks

Example resource limits:
```yaml
services:
  finca:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

