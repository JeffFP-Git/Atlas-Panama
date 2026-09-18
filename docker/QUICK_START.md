# Docker Quick Start

## Prerequisites

1. Install Docker Desktop (Mac/Windows) or Docker Engine (Linux)
2. Create `.env` file in project root:
   ```bash
   RP_USERNAME=your_email@example.com
   RP_PASSWORD=your_password
   BUILDING_NAME=Your Building Name
   HEADLESS=1
   ```

## Quick Commands

### Build Images

```bash
# Build all
docker-compose build

# Build specific service
docker-compose build finca
```

### Run Services

```bash
# Using helper script (recommended)
./docker/run.sh finca --name "Company Name"
./docker/run.sh mercantil --name "Company Name"
./docker/run.sh main --building "Building Name"
./docker/run.sh all

# Or using docker-compose directly
docker-compose run --rm finca --name "Company Name"
docker-compose run --rm mercantil --name "Company Name"
docker-compose run --rm main --building "Building Name"
```

### Build and Run in One Command

```bash
./docker/run.sh --build finca --name "Company Name"
```

## Output Files

All output files are saved to your local directories (mounted as volumes):
- `BuildingData/` - Excel files
- `logs/` - Log files
- `debug-output/` - Debug screenshots/HTML
- `session/` - Session cookies

## Troubleshooting

### Check if containers are running
```bash
docker-compose ps
```

### View logs
```bash
docker-compose logs finca
docker-compose logs mercantil
docker-compose logs main
```

### Clean up
```bash
# Remove stopped containers
docker-compose down

# Remove containers and images
docker-compose down --rmi all
```

### Debug mode
```bash
docker-compose run --rm finca --name "Company Name" --debug=1
```

## Scheduling

### Mac/Linux with Cron

```bash
# Add to crontab (crontab -e)
0 21 * * * cd /path/to/panama-scraper && ./docker/run.sh finca --name "Company Name" >> logs/cron.log 2>&1
```

### Windows with Task Scheduler

Create a task that runs:
```powershell
cd C:\path\to\panama-scraper
docker-compose run --rm finca --name "Company Name"
```

See `docker/README.md` for full documentation.

