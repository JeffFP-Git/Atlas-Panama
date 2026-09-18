#!/bin/bash
# Debug script to test the service manually
# Run this to see what's actually happening

set -e

echo "🔍 Debugging Panama Scraper Service"
echo "===================================="

# Check if .env exists
if [ ! -f /home/ubuntu/panama-scraper/.env ]; then
    echo "❌ .env file not found at /home/ubuntu/panama-scraper/.env"
    exit 1
fi

# Load .env
set -a
source /home/ubuntu/panama-scraper/.env
set +a

echo "✅ Environment variables loaded"
echo "   BUILDING_NAME: ${BUILDING_NAME:-not set}"
echo "   SEARCH_PARAMETER: ${SEARCH_PARAMETER:-not set}"
echo ""

# Check docker-compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found in PATH"
    echo "   Trying to find it..."
    which docker-compose || find /usr -name docker-compose 2>/dev/null | head -1
    exit 1
fi

DOCKER_COMPOSE=$(which docker-compose || find /usr -name docker-compose 2>/dev/null | head -1)
echo "✅ docker-compose found: $DOCKER_COMPOSE"
echo ""

# Check if docker is accessible
if ! docker ps &> /dev/null; then
    echo "❌ Cannot access Docker. Check permissions:"
    echo "   - Is user in docker group? (groups | grep docker)"
    echo "   - Can you run 'docker ps'?"
    exit 1
fi

echo "✅ Docker is accessible"
echo ""

# Check if project directory exists
if [ ! -d /home/ubuntu/panama-scraper ]; then
    echo "❌ Project directory not found: /home/ubuntu/panama-scraper"
    exit 1
fi

echo "✅ Project directory exists"
echo ""

# Check docker-compose.yml
cd /home/ubuntu/panama-scraper
if [ ! -f docker-compose.yml ]; then
    echo "❌ docker-compose.yml not found"
    exit 1
fi

echo "✅ docker-compose.yml found"
echo ""

# Try to run docker-compose ps
echo "📋 Checking docker-compose status..."
$DOCKER_COMPOSE ps || echo "⚠️  docker-compose ps failed (this might be okay if no containers are running)"
echo ""

# Try to build if images don't exist
echo "🔨 Checking if images need to be built..."
$DOCKER_COMPOSE build finca --no-cache 2>&1 | tail -5
echo ""

# Try the actual command
echo "🚀 Running finca scraper..."
echo "Command: $DOCKER_COMPOSE run --rm finca --name \"${BUILDING_NAME:-${SEARCH_PARAMETER}}\""
echo ""

cd /home/ubuntu/panama-scraper
$DOCKER_COMPOSE run --rm finca --name "${BUILDING_NAME:-${SEARCH_PARAMETER}}"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ Success!"
else
    echo ""
    echo "❌ Failed with exit code: $EXIT_CODE"
fi

exit $EXIT_CODE

