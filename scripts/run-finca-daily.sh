#!/bin/bash
# Daily Finca Scraper Runner for Mac/Linux
# This script runs the finca scraper and logs output

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Change to project directory
cd "$PROJECT_DIR" || exit 1

# Load environment variables from .env if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Set up logging
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/finca-daily-$(date +%Y%m%d-%H%M%S).log"
ERROR_LOG="$LOG_DIR/finca-daily-errors.log"

# Function to log with timestamp
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting daily finca scraper run..."

# Check if node is available
if ! command -v node &> /dev/null; then
  log "ERROR: node command not found. Make sure Node.js is installed and in PATH."
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: node command not found" >> "$ERROR_LOG"
  exit 1
fi

# Check if .env has required variables
if [ -z "$BUILDING_NAME" ] && [ -z "$SEARCH_PARAMETER" ]; then
  log "WARNING: BUILDING_NAME or SEARCH_PARAMETER not set in .env"
  log "The scraper will need --name argument or these env vars"
fi

# Run the scraper in headless mode
# Use BUILDING_NAME or SEARCH_PARAMETER from .env, or pass --name if provided
SCRAPER_CMD="node lib/finca.js"
if [ -n "$BUILDING_NAME" ]; then
  SCRAPER_CMD="$SCRAPER_CMD --name \"$BUILDING_NAME\""
elif [ -n "$SEARCH_PARAMETER" ]; then
  SCRAPER_CMD="$SCRAPER_CMD --name \"$SEARCH_PARAMETER\""
fi

# Add headless flag (default to true for cron)
if [ -z "$FINCA_HEADLESS" ]; then
  SCRAPER_CMD="$SCRAPER_CMD --headless=1"
else
  SCRAPER_CMD="$SCRAPER_CMD --headless=$FINCA_HEADLESS"
fi

log "Running: $SCRAPER_CMD"
log "Working directory: $PROJECT_DIR"

# Execute the scraper and capture output
if eval "$SCRAPER_CMD" >> "$LOG_FILE" 2>&1; then
  log "✅ Finca scraper completed successfully"
  exit 0
else
  EXIT_CODE=$?
  log "❌ Finca scraper failed with exit code $EXIT_CODE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Scraper failed with exit code $EXIT_CODE" >> "$ERROR_LOG"
  exit $EXIT_CODE
fi

