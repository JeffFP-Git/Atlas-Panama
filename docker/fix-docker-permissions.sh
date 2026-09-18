#!/bin/bash
# Script to fix Docker permissions on Linux

set -e

echo "🔧 Fixing Docker Permissions"
echo "============================"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "❌ Don't run this script as root/sudo"
    echo "   Run it as your regular user, it will prompt for sudo when needed"
    exit 1
fi

# Get current user
CURRENT_USER=$(whoami)
echo "Current user: $CURRENT_USER"

# Check if user is already in docker group
if groups | grep -q "\bdocker\b"; then
    echo "✅ User is already in docker group"
    echo ""
    echo "If you still have permission issues:"
    echo "  1. Log out and log back in"
    echo "  2. Or run: newgrp docker"
    exit 0
fi

echo ""
echo "Adding user to docker group..."
sudo usermod -aG docker "$CURRENT_USER"

echo ""
echo "✅ User added to docker group"
echo ""
echo "⚠️  IMPORTANT: You need to log out and log back in for changes to take effect"
echo ""
echo "Or run this command to apply changes immediately:"
echo "  newgrp docker"
echo ""
echo "Then test with:"
echo "  docker ps"
echo "  docker-compose version"

