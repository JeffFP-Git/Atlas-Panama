#!/bin/bash
# Fix nginx configuration for Panama API
# Run this on EC2: bash <(curl -s) or copy-paste the commands

set -e

echo "🔧 Fixing nginx configuration..."

# Get Elastic IP (for server_name if no domain)
ELASTIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "localhost")

# Ask for domain or use IP
read -p "Enter your domain (or press Enter to use IP $ELASTIC_IP): " DOMAIN
DOMAIN=${DOMAIN:-$ELASTIC_IP}

echo "📝 Creating nginx configuration for: $DOMAIN"

# Create proper nginx config
sudo tee /etc/nginx/sites-available/panama-api > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Logging
    access_log /var/log/nginx/panama-api-access.log;
    error_log /var/log/nginx/panama-api-error.log;

    # Proxy to Node.js API
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Increase timeouts for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

echo "✅ Configuration file created"

# Enable site
echo "🔗 Enabling site..."
sudo ln -sf /etc/nginx/sites-available/panama-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
echo "🧪 Testing nginx configuration..."
if sudo nginx -t; then
    echo "✅ Configuration is valid!"
    echo "🔄 Restarting nginx..."
    sudo systemctl restart nginx
    sudo systemctl enable nginx
    echo "✅ Nginx is running!"
    echo ""
    echo "🧪 Test your API:"
    echo "   curl http://$DOMAIN/health"
    echo "   (or from local: curl http://$ELASTIC_IP/health)"
else
    echo "❌ Configuration test failed. Check the error above."
    exit 1
fi

