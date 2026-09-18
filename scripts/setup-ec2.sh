#!/bin/bash
# Setup script for EC2 deployment
# Run this on your EC2 instance

set -e

echo "🚀 Setting up Panama Scraper on EC2..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Are you in the panama-scraper directory?"
    exit 1
fi

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    echo "⚠️  docker-compose.yml not found. Checking if we need to pull from git..."
    
    # Check if this is a git repo
    if [ -d ".git" ]; then
        echo "📥 Pulling latest changes from git..."
        git pull
    else
        echo "❌ Error: docker-compose.yml not found and not a git repository."
        echo "   Please either:"
        echo "   1. Clone the repository: git clone <your-repo-url>"
        echo "   2. Or copy docker-compose.yml and Dockerfile.api to this directory"
        exit 1
    fi
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating template..."
    cat > .env << 'EOF'
# Required
RP_USERNAME=your_username
RP_PASSWORD=your_password

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=1
SMTP_USER=your-email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=your-email@gmail.com

# CAPTCHA (Recommended)
CAPTCHA_PROVIDER=2captcha
CAPTCHA_API_KEY=your_2captcha_api_key
CAPTCHA_PLUGIN=1

# API Configuration
PORT=3000
MAX_CONCURRENCY=2
MAX_QUEUE=1000

# Scheduler
DAILY_RUN_TIME=09:00

# Email Recipients
FINCA_EMAIL_RECIPIENTS=recipient@example.com
ALERT_EMAILS=alerts@example.com
EOF
    echo "✅ Created .env template. Please edit it with your credentials:"
    echo "   nano .env"
    exit 1
fi

# Check Docker installation
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    sudo apt update
    sudo apt install -y docker.io docker-compose-plugin
    sudo usermod -aG docker $USER
    echo "✅ Docker installed. Please log out and back in, then run this script again."
    exit 0
fi

# Check if user is in docker group
if ! groups | grep -q docker; then
    echo "⚠️  User not in docker group. Adding..."
    sudo usermod -aG docker $USER
    echo "✅ Added to docker group. Please log out and back in, then run:"
    echo "   docker compose up -d --build api"
    exit 0
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    sudo apt install -y docker-compose-plugin
fi

echo "✅ Prerequisites check complete!"
echo ""
echo "Next steps:"
echo "1. Ensure .env file is configured: nano .env"
echo "2. Start the API: docker compose up -d --build api"
echo "3. View logs: docker compose logs -f api"
echo "4. Check health: curl http://localhost:3000/health"

