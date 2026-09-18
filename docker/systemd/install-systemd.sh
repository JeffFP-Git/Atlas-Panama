#!/bin/bash
# Install systemd services and timers for Panama Scraper
# Run this script on your EC2 instance

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/../.." && pwd )"
SYSTEMD_DIR="$SCRIPT_DIR"

echo "🔧 Installing Panama Scraper Systemd Services"
echo "=============================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run with sudo"
    echo "   Usage: sudo $0"
    exit 1
fi

# Get the user who will run the services (usually ubuntu on EC2)
SERVICE_USER="${SUDO_USER:-ubuntu}"
SERVICE_HOME=$(eval echo ~$SERVICE_USER)
PROJECT_PATH="$SERVICE_HOME/panama-scraper"

echo "Service user: $SERVICE_USER"
echo "Project path: $PROJECT_PATH"
echo ""

# Check if project directory exists
if [ ! -d "$PROJECT_PATH" ]; then
    echo "⚠️  Warning: Project directory not found at $PROJECT_PATH"
    echo "   Please update the service files with the correct path"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create logs directory
mkdir -p "$PROJECT_PATH/logs"
chown -R "$SERVICE_USER:$SERVICE_USER" "$PROJECT_PATH/logs"

# Copy service files to systemd directory
echo "📋 Installing service files..."
cp "$SYSTEMD_DIR"/*.service /etc/systemd/system/
cp "$SYSTEMD_DIR"/*.timer /etc/systemd/system/

# Update paths in service files if needed
if [ "$PROJECT_PATH" != "/home/ubuntu/panama-scraper" ]; then
    echo "📝 Updating paths in service files..."
    sed -i "s|/home/ubuntu/panama-scraper|$PROJECT_PATH|g" /etc/systemd/system/panama-scraper-*.service
fi

# Update user in service files
sed -i "s|User=ubuntu|User=$SERVICE_USER|g" /etc/systemd/system/panama-scraper-*.service
sed -i "s|Group=ubuntu|Group=$SERVICE_USER|g" /etc/systemd/system/panama-scraper-*.service

# Reload systemd
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

# Enable timers (this makes them start on boot)
echo "✅ Enabling timers..."
systemctl enable panama-scraper-finca.timer
systemctl enable panama-scraper-mercantil.timer
systemctl enable panama-scraper-main.timer

# Start timers
echo "🚀 Starting timers..."
systemctl start panama-scraper-finca.timer
systemctl start panama-scraper-mercantil.timer
systemctl start panama-scraper-main.timer

echo ""
echo "✅ Installation complete!"
echo ""
echo "Status:"
systemctl list-timers panama-scraper-*.timer

echo ""
echo "Useful commands:"
echo "  # Check timer status"
echo "  systemctl list-timers panama-scraper-*.timer"
echo ""
echo "  # Check service status"
echo "  systemctl status panama-scraper-finca.service"
echo ""
echo "  # View logs"
echo "  journalctl -u panama-scraper-finca.service -f"
echo "  tail -f $PROJECT_PATH/logs/systemd-finca.log"
echo ""
echo "  # Manually trigger a run"
echo "  systemctl start panama-scraper-finca.service"
echo ""
echo "  # Disable a timer"
echo "  systemctl disable panama-scraper-finca.timer"
echo "  systemctl stop panama-scraper-finca.timer"

