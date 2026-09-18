#!/bin/bash
# Helper script to run Docker containers easily

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

cd "$PROJECT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function print_usage() {
    echo "Usage: $0 [service] [options]"
    echo ""
    echo "Services:"
    echo "  finca      - Run finca scraper"
    echo "  mercantil  - Run mercantil scraper"
    echo "  main       - Run main pipeline scraper"
    echo "  all        - Run all three scrapers in sequence"
    echo ""
    echo "Examples:"
    echo "  $0 finca --name \"Company Name\""
    echo "  $0 mercantil --name \"Company Name\""
    echo "  $0 main --building \"Building Name\""
    echo "  $0 all"
    echo ""
    echo "Options:"
    echo "  --build    - Build images before running"
    echo "  --help     - Show this help message"
}

function build_images() {
    echo -e "${YELLOW}Building Docker images...${NC}"
    docker-compose build "$1" || {
        echo -e "${RED}Failed to build images${NC}"
        exit 1
    }
}

SERVICE=""
BUILD=false
ARGS=()

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        finca|mercantil|main|all)
            SERVICE="$1"
            shift
            ;;
        --build)
            BUILD=true
            shift
            ;;
        --help|-h)
            print_usage
            exit 0
            ;;
        *)
            ARGS+=("$1")
            shift
            ;;
    esac
done

if [ -z "$SERVICE" ]; then
    echo -e "${RED}Error: No service specified${NC}"
    print_usage
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found. Some environment variables may be missing.${NC}"
fi

# Build if requested
if [ "$BUILD" = true ]; then
    build_images "$SERVICE"
fi

# Run the service
echo -e "${GREEN}Running $SERVICE scraper...${NC}"
docker-compose run --rm "$SERVICE" "${ARGS[@]}"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ $SERVICE scraper completed successfully${NC}"
else
    echo -e "${RED}❌ $SERVICE scraper failed with exit code $EXIT_CODE${NC}"
fi

exit $EXIT_CODE

