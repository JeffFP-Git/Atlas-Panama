#!/bin/bash
# Entrypoint script to run all three scrapers in sequence

set -e

echo "🚀 Starting Panama Scraper Pipeline (All Services)"
echo "=================================================="

# Run main scraper first
echo ""
echo "📋 Step 1/3: Running Main Scraper Pipeline..."
node scraper.js "$@"
MAIN_EXIT=$?

if [ $MAIN_EXIT -ne 0 ]; then
  echo "⚠️  Main scraper exited with code $MAIN_EXIT"
fi

# Run mercantil scraper
echo ""
echo "📋 Step 2/3: Running Mercantil Scraper..."
node lib/mercantil.js --headless=1
MERCANTIL_EXIT=$?

if [ $MERCANTIL_EXIT -ne 0 ]; then
  echo "⚠️  Mercantil scraper exited with code $MERCANTIL_EXIT"
fi

# Run finca scraper
echo ""
echo "📋 Step 3/3: Running Finca Scraper..."
node lib/finca.js --headless=1
FINCA_EXIT=$?

if [ $FINCA_EXIT -ne 0 ]; then
  echo "⚠️  Finca scraper exited with code $FINCA_EXIT"
fi

echo ""
echo "=================================================="
echo "✅ Pipeline Complete"
echo "   Main: $MAIN_EXIT | Mercantil: $MERCANTIL_EXIT | Finca: $FINCA_EXIT"

# Exit with error if any failed
if [ $MAIN_EXIT -ne 0 ] || [ $MERCANTIL_EXIT -ne 0 ] || [ $FINCA_EXIT -ne 0 ]; then
  exit 1
fi

exit 0

