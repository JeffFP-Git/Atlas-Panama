# Setting Up HTTPS for API (Port 443)

This guide will help you set up HTTPS on port 443 to bypass network firewall issues.

## Why HTTPS on Port 443?

- **Port 443 is rarely blocked** by ISPs/routers (unlike port 3000)
- **Standard HTTPS port** - browsers and networks expect it
- **More secure** - encrypted traffic
- **Better compatibility** - works from any network

---

## Option 1: Nginx Reverse Proxy (Recommended)

This is the standard approach: run your API on port 3000 internally, and use nginx on port 443 to handle SSL and forward requests.

### Step 1: Install Nginx on EC2

```bash
# On EC2 (Ubuntu/Debian)
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# On EC2 (Amazon Linux)
sudo yum install -y nginx certbot python3-certbot-nginx
```

### Step 2: Get SSL Certificate (Let's Encrypt)

**Option A: Using a Domain Name (Recommended)**

If you have a domain (e.g., `api.yourdomain.com`):

```bash
# Point your domain to your Elastic IP first (DNS A record)
# Then run certbot
sudo certbot --nginx -d api.yourdomain.com

# Follow the prompts - certbot will automatically configure nginx
```

**Option B: Using IP Address Only (More Complex)**

Let's Encrypt doesn't issue certificates for IP addresses directly. You have two options:

1. **Use a domain** (even a free subdomain like `api.example.com`)
2. **Use self-signed certificate** (browsers will show a warning, but it works)

For self-signed (testing only):
```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/nginx-selfsigned.key \
  -out /etc/nginx/ssl/nginx-selfsigned.crt \
  -subj "/CN=YOUR_ELASTIC_IP"

sudo mkdir -p /etc/nginx/ssl
```

### Step 3: Configure Nginx

Create/edit `/etc/nginx/sites-available/panama-api`:

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;  # Or your Elastic IP

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    
    # Or for self-signed:
    # ssl_certificate /etc/nginx/ssl/nginx-selfsigned.crt;
    # ssl_certificate_key /etc/nginx/ssl/nginx-selfsigned.key;

    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Proxy to Node.js API
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # CORS headers (if needed)
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With" always;
    
    if ($request_method = OPTIONS) {
        return 204;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.yourdomain.com;  # Or your Elastic IP
    return 301 https://$server_name$request_uri;
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/panama-api /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

### Step 4: Update AWS Security Group

1. Go to **EC2 → Security Groups → Your security group**
2. **Inbound rules** → **Edit inbound rules**
3. Add rule:
   - **Type**: HTTPS
   - **Port**: 443
   - **Source**: 0.0.0.0/0 (or your IP for testing)
4. Save

### Step 5: Update Frontend

Deploy frontend with HTTPS URL:

```bash
# If using domain:
./scripts/deploy-frontend-s3.sh "https://api.yourdomain.com"

# If using IP with self-signed cert (browsers will warn):
./scripts/deploy-frontend-s3.sh "https://YOUR_ELASTIC_IP"
```

**Note:** With self-signed certificates, browsers will show a security warning. Users will need to click "Advanced" → "Proceed anyway". For production, use a real domain with Let's Encrypt.

---

## Option 2: Use Application Load Balancer (ALB) with SSL

AWS Application Load Balancer can handle SSL termination and forward to your API.

### Pros:
- Managed service (no nginx to maintain)
- Automatic SSL certificate management (ACM)
- Built-in health checks
- Can handle multiple instances

### Cons:
- Costs ~$16/month
- More complex setup
- Requires domain name for ACM certificates

### Setup Steps:

1. **Request SSL Certificate in ACM:**
   - Go to **Certificate Manager** → **Request certificate**
   - Add domain: `api.yourdomain.com`
   - Validate via DNS

2. **Create Application Load Balancer:**
   - **Type**: Application Load Balancer
   - **Scheme**: Internet-facing
   - **Listeners**: HTTPS (443) with your ACM certificate
   - **Target Group**: Point to your EC2 instance (port 3000)

3. **Update Security Group:**
   - Allow port 443 from anywhere
   - Allow port 3000 from ALB security group only

4. **Update Frontend:**
   ```bash
   ./scripts/deploy-frontend-s3.sh "https://api.yourdomain.com"
   ```

---

## Option 3: Use Cloudflare Tunnel (Free, No Port Opening Needed)

Cloudflare Tunnel can expose your API without opening any ports.

### Pros:
- **No port 443 needed** - works through Cloudflare's network
- **Free SSL certificate** (Cloudflare manages it)
- **DDoS protection** included
- **Works from any network** (bypasses all firewalls)

### Cons:
- Requires Cloudflare account
- Traffic goes through Cloudflare (slight latency)
- Need to install `cloudflared` on EC2

### Setup Steps:

1. **Install cloudflared on EC2:**
   ```bash
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
   chmod +x cloudflared-linux-amd64
   sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
   ```

2. **Create Cloudflare Tunnel:**
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create panama-api
   cloudflared tunnel route dns panama-api api.yourdomain.com
   ```

3. **Create config file** `/etc/cloudflared/config.yml`:
   ```yaml
   tunnel: panama-api
   ingress:
     - hostname: api.yourdomain.com
       service: http://localhost:3000
     - service: http_status:404
   ```

4. **Run as service:**
   ```bash
   sudo cloudflared service install
   sudo systemctl start cloudflared
   ```

5. **Update Frontend:**
   ```bash
   ./scripts/deploy-frontend-s3.sh "https://api.yourdomain.com"
   ```

---

## Testing HTTPS Setup

After setup, test from your local machine:

```bash
# Test HTTPS endpoint
curl https://api.yourdomain.com/health

# Or with IP (if using self-signed cert):
curl -k https://YOUR_ELASTIC_IP/health
```

**From browser:**
- Open: `https://api.yourdomain.com/health`
- Should see: `{"ok":true,...}`

---

## Troubleshooting

### "Connection refused" from local machine
- ✅ Check security group allows port 443
- ✅ Check nginx is running: `sudo systemctl status nginx`
- ✅ Check API is running: `curl http://localhost:3000/health`
- ✅ Check nginx logs: `sudo tail -f /var/log/nginx/error.log`

### SSL Certificate Errors
- **Self-signed**: Browsers will warn - this is expected. Click "Advanced" → "Proceed"
- **Let's Encrypt**: Make sure DNS points to your Elastic IP before requesting certificate
- **Expired**: Run `sudo certbot renew` to renew

### API not responding through nginx
- Check nginx config: `sudo nginx -t`
- Check nginx is forwarding correctly: `sudo tail -f /var/log/nginx/access.log`
- Verify API is listening on localhost:3000: `curl http://localhost:3000/health`

---

## Quick Comparison

| Method | Cost | Complexity | Port 443 Needed? | Best For |
|--------|------|------------|------------------|----------|
| **Nginx + Let's Encrypt** | Free | Medium | Yes | Production (with domain) |
| **Nginx + Self-Signed** | Free | Low | Yes | Testing/Development |
| **ALB + ACM** | ~$16/mo | Medium | No (ALB handles it) | Production (AWS-native) |
| **Cloudflare Tunnel** | Free | Low | No | Bypass all firewalls |

---

## Recommendation

**For your use case (bypassing network firewall):**

1. **If you have a domain**: Use **Nginx + Let's Encrypt** (Option 1) - free and standard
2. **If you don't have a domain**: Use **Cloudflare Tunnel** (Option 3) - free, no port opening needed, works from anywhere
3. **If you want AWS-native**: Use **ALB** (Option 2) - costs money but fully managed

**Most likely to solve your firewall issue**: Cloudflare Tunnel, since it doesn't require opening any ports at all.

