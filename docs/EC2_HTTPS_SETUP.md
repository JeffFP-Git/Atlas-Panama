# Step-by-Step: Setting Up HTTPS API on EC2

Complete guide to set up your Panama Scraper API with HTTPS (port 443) using nginx and a self-signed SSL certificate.

---

## Prerequisites

- ✅ EC2 instance running (Ubuntu/Debian)
- ✅ API running on port 3000
- ✅ Elastic IP assigned to your EC2 instance
- ✅ SSH access to EC2
- ✅ AWS Security Group access

---

## Step 1: Get Your Elastic IP

**On EC2, run:**
```bash
curl http://169.254.169.254/latest/meta-data/public-ipv4
```

**Or check AWS Console:**
- EC2 → Instances → Your instance → Details → Public IPv4 address

**Note your IP** - you'll need it for the SSL certificate and nginx configuration.

---

## Step 2: Install Nginx

**On EC2, run:**
```bash
# Update package list
sudo apt update

# Install nginx
sudo apt install -y nginx

# Check nginx version
nginx -v
```

---

## Step 3: Create SSL Certificate Directory

**On EC2, run:**
```bash
sudo mkdir -p /etc/nginx/ssl
```

---

## Step 4: Generate Self-Signed SSL Certificate

**On EC2, run (replace `YOUR_ELASTIC_IP` with your actual IP, e.g., `18.189.116.22`):**
```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/nginx-selfsigned.key \
  -out /etc/nginx/ssl/nginx-selfsigned.crt \
  -subj "/CN=YOUR_ELASTIC_IP"
```

**Example (if your IP is 18.189.116.22):**
```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/nginx-selfsigned.key \
  -out /etc/nginx/ssl/nginx-selfsigned.crt \
  -subj "/CN=18.189.116.22"
```

**Verify certificate was created:**
```bash
sudo ls -la /etc/nginx/ssl/
```

You should see:
- `nginx-selfsigned.crt` (certificate)
- `nginx-selfsigned.key` (private key)

---

## Step 5: Create Nginx Configuration

**On EC2, run:**
```bash
sudo nano /etc/nginx/sites-available/panama-api
```

**Paste this configuration (replace `YOUR_ELASTIC_IP` with your actual IP):**
```nginx
server {
    listen 443 ssl http2;
    server_name YOUR_ELASTIC_IP;

    ssl_certificate /etc/nginx/ssl/nginx-selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/nginx-selfsigned.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    access_log /var/log/nginx/panama-api-access.log;
    error_log /var/log/nginx/panama-api-error.log;

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

server {
    listen 80;
    server_name YOUR_ELASTIC_IP;
    return 301 https://$server_name$request_uri;
}
```

**Save and exit:**
- Press `Ctrl+X`
- Press `Y`
- Press `Enter`

---

## Step 6: Enable Nginx Site

**On EC2, run:**
```bash
# Create symbolic link to enable site
sudo ln -s /etc/nginx/sites-available/panama-api /etc/nginx/sites-enabled/

# Remove default nginx site (optional)
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t
```

**Expected output:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**If you see errors**, check:
- Certificate paths are correct
- IP address matches in `server_name`
- No syntax errors in the config file

---

## Step 7: Start and Enable Nginx

**On EC2, run:**
```bash
# Start nginx
sudo systemctl start nginx

# Enable nginx to start on boot
sudo systemctl enable nginx

# Check nginx status
sudo systemctl status nginx
```

**Expected output:** `Active: active (running)`

---

## Step 8: Update AWS Security Group

**In AWS Console:**

1. Go to **EC2 → Security Groups**
2. Select your EC2 instance's security group
3. Click **Edit inbound rules**
4. Add/Update rules:

   **HTTP (port 80) - for redirect to HTTPS:**
   - **Type**: HTTP
   - **Port**: 80
   - **Source**: 0.0.0.0/0
   
   **HTTPS (port 443) - for your API:**
   - **Type**: HTTPS
   - **Port**: 443
   - **Source**: 0.0.0.0/0 (or your IP for testing)

5. Click **Save rules**

---

## Step 9: Test HTTPS on EC2

**On EC2, run:**
```bash
# Test HTTPS endpoint
curl -k https://localhost/health
```

**Expected response:**
```json
{"ok":true,"running":0,"queued":0,"concurrency":2}
```

**If you get "Connection refused":**
- Check nginx is running: `sudo systemctl status nginx`
- Check nginx is listening on 443: `sudo netstat -tlnp | grep :443`
- Check error logs: `sudo tail -30 /var/log/nginx/error.log`

---

## Step 10: Test HTTPS from Local Machine

**From your local machine, run:**
```bash
# Replace YOUR_ELASTIC_IP with your actual IP
curl -k https://YOUR_ELASTIC_IP/health
```

**Expected response:**
```json
{"ok":true,"running":0,"queued":0,"concurrency":2}
```

**Test in browser:**
1. Open: `https://YOUR_ELASTIC_IP/health`
2. You'll see a security warning (expected for self-signed certificate)
3. Click **Advanced** → **Proceed to YOUR_IP (unsafe)**
4. You should see the JSON response

---

## Step 11: Update API CORS Configuration

**On EC2, update `.env` to allow your frontend domain:**
```bash
cd ~/panama-scraper

# Add S3 website to CORS origins
echo 'CORS_ORIGINS=https://panama-scraper-frontend.s3-website-us-east-1.amazonaws.com,http://panama-scraper-frontend.s3-website-us-east-1.amazonaws.com' >> .env
```

**Restart your API:**
```bash
# If using screen
screen -r api
# Press Ctrl+C to stop
node api.js
# Press Ctrl+A then D to detach

# Or if using PM2
pm2 restart api
```

---

## Step 12: Deploy Frontend with HTTPS URL

**From your local machine:**
```bash
cd /Users/jonathanchristie/Code/panama-scraper

# Deploy with HTTPS URL
export S3_BUCKET="panama-scraper-frontend"
./scripts/deploy-frontend-s3.sh "https://YOUR_ELASTIC_IP"
```

**Replace `YOUR_ELASTIC_IP` with your actual IP (e.g., `18.189.116.22`)**

---

## Step 13: Verify Everything Works

**Test checklist:**

1. ✅ **API health check:**
   ```bash
   curl -k https://YOUR_ELASTIC_IP/health
   ```

2. ✅ **Subscription endpoint:**
   ```bash
   curl -k -X POST https://YOUR_ELASTIC_IP/subscribe/submit \
     -H "Content-Type: application/json" \
     -d '{
       "tipo": "inmueble",
       "folio": "12345",
       "codigo": "TEST",
       "email": "test@example.com"
     }'
   ```

3. ✅ **Frontend loads:** Visit your S3 website
4. ✅ **Form submission works:** Submit a test subscription
5. ✅ **No CORS errors:** Check browser console (F12)

---

## Troubleshooting

### Issue: "Connection refused" on port 443

**Check nginx is running:**
```bash
sudo systemctl status nginx
```

**Check nginx is listening on 443:**
```bash
sudo netstat -tlnp | grep :443
```

**Check nginx error logs:**
```bash
sudo tail -50 /var/log/nginx/error.log
```

**Common fixes:**
- Restart nginx: `sudo systemctl restart nginx`
- Check security group allows port 443
- Verify SSL certificate files exist: `sudo ls -la /etc/nginx/ssl/`

---

### Issue: "502 Bad Gateway"

**Problem:** Nginx can't reach your API on port 3000.

**Check API is running:**
```bash
curl http://localhost:3000/health
```

**If API isn't running, start it:**
```bash
cd ~/panama-scraper
screen -S api
node api.js
# Press Ctrl+A then D to detach
```

**Check nginx proxy_pass is correct:**
```bash
sudo cat /etc/nginx/sites-available/panama-api
```

Should show: `proxy_pass http://localhost:3000;`

---

### Issue: Browser shows "Your connection is not private"

**This is expected** with self-signed certificates.

**Solution:**
1. Click **Advanced**
2. Click **Proceed to YOUR_IP (unsafe)**
3. Browser will remember the exception for this session

**Note:** Users will see this warning. For production, use a real domain with Let's Encrypt (see `docs/NGINX_LETSENCRYPT_SETUP.md`).

---

### Issue: "Failed to fetch" from frontend

**Possible causes:**

1. **CORS not configured:**
   - Check `.env` has `CORS_ORIGINS` with your S3 website URL
   - Restart API

2. **Certificate not accepted:**
   - Visit API directly in browser first: `https://YOUR_IP/health`
   - Accept the certificate warning
   - Then try the form

3. **API_BASE_URL not set in frontend:**
   - View page source on S3 website
   - Search for `API_BASE_URL`
   - Should show: `<script>window.API_BASE_URL = 'https://YOUR_IP';</script>`
   - If missing, redeploy frontend

4. **Check browser console (F12):**
   - Look for specific error messages
   - Check Network tab for failed requests

---

### Issue: Nginx config test fails

**Check syntax:**
```bash
sudo nginx -t
```

**Common errors:**
- Missing semicolons
- Wrong file paths
- IP address mismatch

**View config:**
```bash
sudo cat /etc/nginx/sites-available/panama-api
```

**Fix and retest:**
```bash
sudo nano /etc/nginx/sites-available/panama-api
# Fix errors
sudo nginx -t
sudo systemctl restart nginx
```

---

## Quick Reference Commands

**Check nginx status:**
```bash
sudo systemctl status nginx
```

**Restart nginx:**
```bash
sudo systemctl restart nginx
```

**Test nginx config:**
```bash
sudo nginx -t
```

**View nginx logs:**
```bash
# Error logs
sudo tail -f /var/log/nginx/error.log

# Access logs
sudo tail -f /var/log/nginx/panama-api-access.log
```

**Check what ports are listening:**
```bash
sudo netstat -tlnp | grep -E ':(80|443|3000)'
```

**View nginx config:**
```bash
sudo cat /etc/nginx/sites-available/panama-api
```

**Check SSL certificate:**
```bash
sudo ls -la /etc/nginx/ssl/
```

**Test API directly:**
```bash
curl http://localhost:3000/health
```

**Test through nginx:**
```bash
curl -k https://localhost/health
```

---

## Security Notes

⚠️ **Self-signed certificates:**
- Browsers will show security warnings
- Not suitable for production with real users
- Users must manually accept the certificate

✅ **For production:**
- Use a real domain
- Get Let's Encrypt certificate (free)
- See `docs/NGINX_LETSENCRYPT_SETUP.md`

✅ **Current setup is good for:**
- Development/testing
- Internal tools
- Bypassing network firewalls (port 443 is rarely blocked)

---

## Next Steps

1. ✅ HTTPS is working on port 443
2. ✅ API is accessible via `https://YOUR_IP`
3. ✅ Frontend is deployed with HTTPS URL
4. 🔄 Test form submissions from frontend
5. 🔄 Monitor for any CORS or certificate issues

---

## Summary

You now have:
- ✅ Nginx reverse proxy running
- ✅ HTTPS on port 443 (self-signed certificate)
- ✅ HTTP redirects to HTTPS
- ✅ API proxied through nginx
- ✅ Frontend configured to use HTTPS API

**Your API is accessible at:** `https://YOUR_ELASTIC_IP`

**Your frontend is at:** `https://panama-scraper-frontend.s3-website-us-east-1.amazonaws.com`

---

For Let's Encrypt setup with a real domain, see: `docs/NGINX_LETSENCRYPT_SETUP.md`

