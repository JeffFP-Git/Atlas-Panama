# Step-by-Step: Nginx + Let's Encrypt Setup on EC2

Complete guide to set up HTTPS on port 443 using Nginx reverse proxy and Let's Encrypt SSL certificate.

---

## Prerequisites

1. **Domain name** (e.g., `api.yourdomain.com` or `yourdomain.com`)
   - If you don't have one, you can get a free domain from:
     - Freenom (free domains like `.tk`, `.ml`, `.ga`)
     - Namecheap (~$1-10/year for `.com`)
     - Google Domains
   
2. **DNS access** to point your domain to your EC2 Elastic IP

3. **SSH access** to your EC2 instance

---

## Step 1: Point Your Domain to EC2

Before requesting SSL certificate, your domain must point to your EC2 Elastic IP.

### Get Your Elastic IP

On EC2, run:
```bash
curl http://169.254.169.254/latest/meta-data/public-ipv4
```

Or check AWS Console: **EC2 → Instances → Your instance → Details → Public IPv4 address**

### Update DNS

1. Go to your domain registrar (where you bought the domain)
2. Find **DNS Management** or **Name Servers**
3. Add/Update an **A Record**:
   - **Name/Host**: `api` (or `@` for root domain)
   - **Type**: A
   - **Value**: Your Elastic IP (e.g., `3.14.14.201`)
   - **TTL**: 300 (or default)

**Example:**
- Domain: `yourdomain.com`
- Subdomain: `api.yourdomain.com`
- A Record: `api` → `3.14.14.201`

### Verify DNS Propagation

Wait 5-10 minutes, then verify:
```bash
# From your local machine
nslookup api.yourdomain.com
# Should return your Elastic IP

# Or
dig api.yourdomain.com
```

**Important:** Let's Encrypt will verify you own the domain by checking DNS. Make sure DNS is propagated before proceeding.

---

## Step 2: Install Nginx and Certbot

SSH into your EC2 instance and run:

```bash
# Update package list
sudo apt update

# Install nginx
sudo apt install -y nginx

# Install certbot (for Let's Encrypt SSL certificates)
sudo apt install -y certbot python3-certbot-nginx

# Check nginx version
nginx -v

# Check certbot version
certbot --version
```

---

## Step 3: Configure Nginx (Before SSL)

Create nginx configuration for your API:

```bash
# Create configuration file
sudo nano /etc/nginx/sites-available/panama-api
```

Paste this configuration (replace `api.yourdomain.com` with your actual domain):

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

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
        
        # Increase timeouts for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

Enable the site:
```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/panama-api /etc/nginx/sites-enabled/

# Remove default nginx site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t
```

If test passes, restart nginx:
```bash
sudo systemctl restart nginx
sudo systemctl enable nginx  # Start on boot
```

---

## Step 4: Update AWS Security Group

Allow HTTP (port 80) and HTTPS (port 443) traffic:

1. Go to **AWS Console → EC2 → Security Groups**
2. Select your EC2 instance's security group
3. Click **Edit inbound rules**
4. Add/Update rules:

   **HTTP (for Let's Encrypt verification):**
   - **Type**: HTTP
   - **Port**: 80
   - **Source**: 0.0.0.0/0
   
   **HTTPS (for your API):**
   - **Type**: HTTPS
   - **Port**: 443
   - **Source**: 0.0.0.0/0

5. Click **Save rules**

---

## Step 5: Get SSL Certificate with Let's Encrypt

Now request your free SSL certificate:

```bash
# Request certificate (replace with your domain)
sudo certbot --nginx -d api.yourdomain.com

# If you want to include www subdomain too:
# sudo certbot --nginx -d api.yourdomain.com -d www.api.yourdomain.com
```

**What certbot will do:**
1. Verify you own the domain (via DNS/HTTP challenge)
2. Generate SSL certificate
3. Automatically update nginx configuration to use HTTPS
4. Set up automatic renewal

**Follow the prompts:**
- **Email**: Enter your email (for renewal notifications)
- **Agree to terms**: Type `Y`
- **Share email**: Your choice (Y/N)
- **Redirect HTTP to HTTPS**: Type `2` (recommended)

Certbot will automatically:
- Update your nginx config to use SSL
- Add redirect from HTTP to HTTPS
- Configure certificate renewal

---

## Step 6: Verify SSL Certificate

Test that everything works:

```bash
# Test from EC2
curl https://api.yourdomain.com/health

# Check certificate details
sudo certbot certificates
```

**From your local machine:**
```bash
# Test HTTPS endpoint
curl https://api.yourdomain.com/health

# Should return: {"ok":true,"running":0,"queued":0,"concurrency":2}
```

**From browser:**
- Open: `https://api.yourdomain.com/health`
- Should see green lock icon (🔒) in address bar
- Should see API response

---

## Step 7: Update Frontend to Use HTTPS

Deploy your frontend with the new HTTPS URL:

```bash
# From your local machine
cd /Users/jonathanchristie/Code/panama-scraper

# Deploy with HTTPS URL
export S3_BUCKET="panama-scraper-frontend"  # Your bucket name
./scripts/deploy-frontend-s3.sh "https://api.yourdomain.com"
```

---

## Step 8: Test Automatic Renewal

Let's Encrypt certificates expire every 90 days. Certbot sets up automatic renewal, but test it:

```bash
# Test renewal (dry run - won't actually renew)
sudo certbot renew --dry-run

# If successful, you're all set!
```

Certbot automatically renews certificates. The renewal is handled by a systemd timer that runs twice daily.

---

## Step 9: Update API CORS (If Needed)

If your frontend is on a different domain, update CORS in `api.js`:

```bash
# On EC2, edit api.js
nano ~/panama-scraper/api.js
```

Find the `allowedOrigins` array and add your frontend domain:

```javascript
const allowedOrigins = [
  // ... existing origins ...
  'https://your-frontend-domain.com',
  'https://panama-scraper-frontend.s3-website.us-east-1.amazonaws.com',
  // ... etc
];
```

Restart API:
```bash
# Find and restart your API process
pm2 restart api
# Or if using screen/systemd, restart accordingly
```

---

## Troubleshooting

### "Domain not pointing to this server"

**Problem:** Let's Encrypt can't verify domain ownership.

**Solution:**
1. Wait for DNS propagation (can take up to 48 hours, usually 5-10 minutes)
2. Verify DNS: `nslookup api.yourdomain.com` should return your Elastic IP
3. Make sure security group allows port 80 (needed for verification)

### "Connection refused" on HTTPS

**Check:**
```bash
# Is nginx running?
sudo systemctl status nginx

# Is API running?
curl http://localhost:3000/health

# Check nginx error logs
sudo tail -f /var/log/nginx/error.log

# Check nginx config
sudo nginx -t
```

### "502 Bad Gateway"

**Problem:** Nginx can't reach your API.

**Solution:**
1. Make sure API is running: `curl http://localhost:3000/health`
2. Check API is listening on `0.0.0.0:3000` (not just `127.0.0.1:3000`)
3. Check nginx proxy_pass is correct: `proxy_pass http://localhost:3000;`

### Certificate renewal fails

**Check renewal logs:**
```bash
sudo certbot renew --dry-run
sudo journalctl -u certbot.timer
```

**Manual renewal:**
```bash
sudo certbot renew
sudo systemctl reload nginx
```

### CORS errors from frontend

**Solution:**
1. Update `CORS_ORIGINS` in `.env` on EC2:
   ```bash
   echo 'CORS_ORIGINS=https://your-frontend-domain.com' >> ~/panama-scraper/.env
   ```
2. Restart API

---

## Quick Reference Commands

```bash
# Check nginx status
sudo systemctl status nginx

# Restart nginx
sudo systemctl restart nginx

# Test nginx config
sudo nginx -t

# View nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/panama-api-access.log

# Check SSL certificate
sudo certbot certificates

# Renew certificate manually
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run

# View nginx config
sudo cat /etc/nginx/sites-available/panama-api
```

---

## Final Checklist

- [ ] Domain DNS points to Elastic IP
- [ ] DNS propagated (verified with `nslookup`)
- [ ] Nginx installed and running
- [ ] Nginx config created and enabled
- [ ] Security group allows ports 80 and 443
- [ ] SSL certificate obtained from Let's Encrypt
- [ ] HTTPS endpoint works: `curl https://api.yourdomain.com/health`
- [ ] Frontend deployed with HTTPS URL
- [ ] Certificate auto-renewal tested

---

## Next Steps

1. ✅ HTTPS is now working on port 443
2. ✅ Your API is accessible via `https://api.yourdomain.com`
3. ✅ Frontend should now work from any network (port 443 is rarely blocked)
4. 🔄 Monitor certificate renewal (automatic, but check logs occasionally)
5. 🔄 Consider setting up monitoring/alerting for API uptime

---

## Cost

- **Domain**: $0-15/year (depending on TLD)
- **Let's Encrypt SSL**: Free
- **Nginx**: Free
- **Total**: Just domain cost (if you don't already have one)

---

**Your API is now accessible via HTTPS!** 🎉

Test it: `https://api.yourdomain.com/health`

