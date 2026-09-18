#!/bin/bash
# Setup Cloudflare Tunnel for Panama Scraper API (No Domain Needed!)
# This provides free HTTPS without needing a domain or opening port 443

set -e

echo "🚀 Setting up Cloudflare Tunnel for Panama Scraper API"
echo "   This will give you free HTTPS without a domain!"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "📦 Installing cloudflared..."
    
    # Detect architecture
    ARCH=$(uname -m)
    if [ "$ARCH" = "x86_64" ]; then
        ARCH="amd64"
    elif [ "$ARCH" = "aarch64" ]; then
        ARCH="arm64"
    else
        echo "❌ Unsupported architecture: $ARCH"
        exit 1
    fi
    
    # Download cloudflared
    wget -q "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}" -O /tmp/cloudflared
    chmod +x /tmp/cloudflared
    sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
    
    echo "✅ cloudflared installed"
else
    echo "✅ cloudflared already installed"
fi

echo ""
echo "🔐 Step 1: Login to Cloudflare"
echo "   This will open a browser window or give you a URL to visit"
echo "   You need a free Cloudflare account: https://dash.cloudflare.com/sign-up"
echo ""
read -p "Press Enter to continue with login..."

cloudflared tunnel login

echo ""
echo "🔨 Step 2: Creating tunnel..."
TUNNEL_NAME="panama-api"
cloudflared tunnel create "$TUNNEL_NAME" || {
    echo "⚠️  Tunnel might already exist, continuing..."
}

# Get tunnel ID
TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}' | head -1)

if [ -z "$TUNNEL_ID" ]; then
    echo "❌ Could not find tunnel ID. Please create tunnel manually:"
    echo "   cloudflared tunnel create $TUNNEL_NAME"
    exit 1
fi

echo "✅ Tunnel created: $TUNNEL_ID"

# Create config directory
sudo mkdir -p /etc/cloudflared

# Find credentials file
CREDENTIALS_FILE=$(find ~ -name "${TUNNEL_ID}.json" 2>/dev/null | head -1)

if [ -z "$CREDENTIALS_FILE" ]; then
    echo "⚠️  Could not find credentials file automatically."
    echo "   Please find it manually and update the config."
    CREDENTIALS_FILE="/home/$(whoami)/.cloudflared/${TUNNEL_ID}.json"
fi

echo ""
echo "📝 Step 3: Creating config file..."

# Create config
sudo tee /etc/cloudflared/config.yml > /dev/null <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CREDENTIALS_FILE

ingress:
  # Route all traffic to your API
  - service: http://localhost:3000
  # Catch-all rule (must be last)
  - service: http_status:404
EOF

echo "✅ Config created at /etc/cloudflared/config.yml"

echo ""
echo "🔧 Step 4: Installing as systemd service..."
sudo cloudflared service install

echo ""
echo "🔄 Step 5: Starting service..."
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

echo ""
echo "⏳ Waiting for tunnel to start..."
sleep 3

# Check status
if sudo systemctl is-active --quiet cloudflared; then
    echo "✅ Cloudflare Tunnel is running!"
else
    echo "❌ Service failed to start. Check logs:"
    echo "   sudo journalctl -u cloudflared -f"
    exit 1
fi

echo ""
echo "🌐 Step 6: Getting your tunnel URL..."
echo "   Checking Cloudflare dashboard..."

# Try to get route info
echo ""
echo "📋 Your tunnel is set up!"
echo ""
echo "🔍 To get your tunnel URL, run:"
echo "   cloudflared tunnel route dns list"
echo ""
echo "   Or check Cloudflare dashboard:"
echo "   https://dash.cloudflare.com → Zero Trust → Networks → Tunnels"
echo ""
echo "   Your API will be accessible at a URL like:"
echo "   https://panama-api-XXXXX.trycloudflare.com"
echo ""
echo "🧪 Test your tunnel:"
echo "   curl https://YOUR_TUNNEL_URL/health"
echo ""
echo "📝 Update frontend:"
echo "   ./scripts/deploy-frontend-s3.sh \"https://YOUR_TUNNEL_URL\""
echo ""
echo "✅ Setup complete!"
echo ""
echo "📚 Useful commands:"
echo "   - Check status: sudo systemctl status cloudflared"
echo "   - View logs: sudo journalctl -u cloudflared -f"
echo "   - Restart: sudo systemctl restart cloudflared"
echo "   - List tunnels: cloudflared tunnel list"
echo ""

