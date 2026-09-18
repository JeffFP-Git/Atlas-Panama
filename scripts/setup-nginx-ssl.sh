#!/bin/bash
# Setup Nginx + Let's Encrypt SSL for Panama Scraper API
# Usage: ./scripts/setup-nginx-ssl.sh api.yourdomain.com

set -e

DOMAIN="${1:-}"

if [ -z "$DOMAIN" ]; then
  echo "❌ Error: Domain name required"
  echo "Usage: $0 api.yourdomain.com"
  exit 1
fi

echo "🚀 Setting up Nginx + Let's Encrypt SSL for: $DOMAIN"
echo ""

# Step 1: Install dependencies
echo "📦 Step 1: Installing Nginx and Certbot..."
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# Step 2: Create nginx configuration
echo ""
echo "📝 Step 2: Creating Nginx configuration..."
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

# Step 3: Enable site
echo "🔗 Step 3: Enabling Nginx site..."
sudo ln -sf /etc/nginx/sites-available/panama-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Step 4: Test and restart nginx
echo "🧪 Step 4: Testing Nginx configuration..."
sudo nginx -t

echo "🔄 Step 5: Restarting Nginx..."
sudo systemctl restart nginx
sudo systemctl enable nginx

echo ""
echo "✅ Nginx is configured and running!"
echo ""
echo "⚠️  IMPORTANT: Before getting SSL certificate:"
echo "   1. Make sure DNS points to this server: nslookup $DOMAIN"
echo "   2. Make sure AWS Security Group allows port 80 (HTTP)"
echo "   3. Wait 5-10 minutes for DNS propagation"
echo ""
read -p "Press Enter when DNS is configured and propagated..."

# Step 5: Get SSL certificate
echo ""
echo "🔐 Step 6: Requesting SSL certificate from Let's Encrypt..."
echo "   (This will prompt for email and agreement to terms)"
echo ""
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect

echo ""
echo "✅ SSL certificate installed!"
echo ""
echo "🧪 Testing HTTPS endpoint..."
curl -s https://$DOMAIN/health | head -c 100
echo ""
echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Update frontend: ./scripts/deploy-frontend-s3.sh \"https://$DOMAIN\""
echo "   2. Test from browser: https://$DOMAIN/health"
echo "   3. Certificate auto-renews every 90 days"
echo ""
echo "🔍 Useful commands:"
echo "   - Check certificate: sudo certbot certificates"
echo "   - Test renewal: sudo certbot renew --dry-run"
echo "   - View nginx logs: sudo tail -f /var/log/nginx/error.log"
echo ""

