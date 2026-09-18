# HTTPS Without a Domain

You can set up HTTPS without a domain, but with some limitations. Here are your options:

---

## Option 1: Self-Signed Certificate (Quick Testing)

**Pros:**
- ✅ Works immediately
- ✅ No domain needed
- ✅ Free

**Cons:**
- ❌ Browsers show security warning (users must click "Advanced" → "Proceed")
- ❌ Not suitable for production
- ❌ Frontend JavaScript may have issues with self-signed certs

### Setup Steps:

```bash
# On EC2

# 1. Install nginx (if not already installed)
sudo apt update
sudo apt install -y nginx

# 2. Create SSL directory
sudo mkdir -p /etc/nginx/ssl

# 3. Generate self-signed certificate
# Replace YOUR_ELASTIC_IP with your actual IP (e.g., 3.14.14.201)
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/nginx-selfsigned.key \
  -out /etc/nginx/ssl/nginx-selfsigned.crt \
  -subj "/CN=YOUR_ELASTIC_IP"

# 4. Create nginx config
sudo nano /etc/nginx/sites-available/panama-api
```

Paste this (replace `YOUR_ELASTIC_IP` with your actual IP):

```nginx
server {
    listen 443 ssl http2;
    server_name YOUR_ELASTIC_IP;

    # Self-signed SSL
    ssl_certificate /etc/nginx/ssl/nginx-selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/nginx-selfsigned.key;

    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Logging
    access_log /var/log/nginx/panama-api-access.log;
    error_log /var/log/nginx/panama-api-error.log;

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
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name YOUR_ELASTIC_IP;
    return 301 https://$server_name$request_uri;
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/panama-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

**Update Security Group:**
- Allow port 443 (HTTPS) from 0.0.0.0/0

**Test:**
```bash
# From EC2
curl -k https://YOUR_ELASTIC_IP/health

# From local machine (will show warning in browser)
curl -k https://YOUR_ELASTIC_IP/health
```

**Browser Warning:**
When accessing in browser, you'll see "Your connection is not private" warning. Click:
- **Advanced** → **Proceed to YOUR_IP (unsafe)**

**Frontend Deployment:**
```bash
./scripts/deploy-frontend-s3.sh "https://YOUR_ELASTIC_IP"
```

**Note:** Browsers accessing your frontend will also see the warning. Users must accept the certificate.

---

## Option 2: Cloudflare Tunnel (Recommended - No Domain Needed!)

**Pros:**
- ✅ **Free SSL certificate** (Cloudflare manages it)
- ✅ **No domain needed** - Cloudflare provides a free subdomain
- ✅ **No port 443 needed** - works through Cloudflare's network
- ✅ **Bypasses ALL firewalls** - works from any network
- ✅ **No browser warnings** - legitimate SSL certificate
- ✅ **DDoS protection** included

**Cons:**
- ⚠️ Traffic goes through Cloudflare (slight latency, but usually negligible)
- ⚠️ Requires Cloudflare account (free)

### Setup Steps:

#### Step 1: Create Cloudflare Account

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up for free account
3. Verify your email

#### Step 2: Install cloudflared on EC2

```bash
# On EC2
# Download cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64

# Make executable
chmod +x cloudflared-linux-amd64

# Move to system path
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared

# Verify installation
cloudflared --version
```

#### Step 3: Login to Cloudflare

```bash
# This will open a browser - login to Cloudflare
cloudflared tunnel login
```

**Note:** If you're SSH'd into EC2, this will give you a URL. Copy it and open in your local browser to authenticate.

#### Step 4: Create Tunnel

```bash
# Create a tunnel (replace 'panama-api' with any name you want)
cloudflared tunnel create panama-api
```

This creates a tunnel and saves credentials.

#### Step 5: Create Config File

```bash
# Create config directory
sudo mkdir -p /etc/cloudflared

# Create config file
sudo nano /etc/cloudflared/config.yml
```

Paste this:

```yaml
tunnel: panama-api
credentials-file: /home/ubuntu/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  # Route traffic to your API
  - hostname: panama-api-XXXXX.trycloudflare.com
    service: http://localhost:3000
  # Catch-all rule (must be last)
  - service: http_status:404
```

**Get your tunnel ID:**
```bash
cloudflared tunnel list
# Copy the UUID shown for 'panama-api'
```

**Get free Cloudflare subdomain:**
```bash
# Run tunnel to get the free subdomain
cloudflared tunnel --url http://localhost:3000
# This will output something like: https://panama-api-abc123.trycloudflare.com
# Copy that hostname and use it in config.yml
```

Or use Cloudflare's automatic subdomain:
```bash
# Cloudflare will assign a random subdomain automatically
# Just use: panama-api-XXXXX.trycloudflare.com (replace XXXXX with random string)
```

#### Step 6: Run Tunnel as Service

```bash
# Install as systemd service
sudo cloudflared service install

# Start the service
sudo systemctl start cloudflared

# Enable on boot
sudo systemctl enable cloudflared

# Check status
sudo systemctl status cloudflared
```

#### Step 7: Get Your Cloudflare URL

```bash
# View tunnel info
cloudflared tunnel info panama-api

# Or check Cloudflare dashboard:
# https://dash.cloudflare.com → Zero Trust → Networks → Tunnels
```

Your API will be accessible at: `https://panama-api-XXXXX.trycloudflare.com`

#### Step 8: Test

```bash
# From anywhere (even your local machine with firewall issues)
curl https://panama-api-XXXXX.trycloudflare.com/health
```

#### Step 9: Deploy Frontend

```bash
# Deploy with Cloudflare URL
./scripts/deploy-frontend-s3.sh "https://panama-api-XXXXX.trycloudflare.com"
```

**No Security Group Changes Needed!** Cloudflare Tunnel doesn't require opening any ports.

---

## Option 3: Get a Free Domain

If you want a proper domain (recommended for production):

### Free Domain Options:

1. **Freenom** (https://www.freenom.com)
   - Free domains: `.tk`, `.ml`, `.ga`, `.cf`, `.gq`
   - Example: `panama-api.ml`
   - Free for 1 year, then ~$1-2/year

2. **Namecheap** 
   - `.xyz` domains: ~$1/year
   - `.online` domains: ~$1-2/year

3. **Google Domains**
   - Various TLDs starting at ~$12/year

Then follow the **Nginx + Let's Encrypt** guide from `docs/NGINX_LETSENCRYPT_SETUP.md`.

---

## Comparison

| Option | Cost | Domain Needed? | Browser Warnings? | Port 443 Needed? | Best For |
|-------|------|----------------|-------------------|------------------|----------|
| **Self-Signed** | Free | No | Yes (users must accept) | Yes | Testing only |
| **Cloudflare Tunnel** | Free | No (free subdomain) | No | No | Production |
| **Free Domain + Let's Encrypt** | ~$1-2/year | Yes (free from Freenom) | No | Yes | Production |

---

## Recommendation

**For your situation (bypassing firewall without domain):**

👉 **Use Cloudflare Tunnel (Option 2)**

**Why:**
- ✅ No domain needed (Cloudflare provides free subdomain)
- ✅ No port 443 needed (bypasses all firewalls)
- ✅ Legitimate SSL (no browser warnings)
- ✅ Free
- ✅ Works from any network

**Setup time:** ~10 minutes

---

## Quick Start: Cloudflare Tunnel

```bash
# On EC2 - One-liner setup
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /tmp/cloudflared && chmod +x /tmp/cloudflared && sudo mv /tmp/cloudflared /usr/local/bin/cloudflared

# Login
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create panama-api

# Run tunnel (get the URL it gives you)
cloudflared tunnel --url http://localhost:3000
# Copy the https://panama-api-XXXXX.trycloudflare.com URL

# Install as service (use the URL from above)
sudo cloudflared service install
sudo systemctl start cloudflared

# Test
curl https://panama-api-XXXXX.trycloudflare.com/health
```

That's it! Your API is now accessible via HTTPS from anywhere, no domain or port 443 needed.

