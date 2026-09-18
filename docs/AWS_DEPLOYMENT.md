# AWS Deployment Guide: Frontend + EC2 API

Complete guide for hosting the frontend and API in AWS.

## Architecture Options

### Option 1: Simple - EC2 Serves Both (Recommended for Start)

**Architecture:**
- EC2 instance runs Docker container with API
- Express.js serves static files from `/public` directory
- Single domain/URL for everything

**Pros:**
- ✅ Simplest setup
- ✅ No CORS issues
- ✅ Single point of management
- ✅ Lower cost

**Cons:**
- ❌ Frontend and backend coupled
- ❌ Less scalable for high traffic
- ❌ No CDN for static assets

---

### Option 2: S3 + CloudFront + EC2 (Recommended for Production)

**Architecture:**
- **S3**: Hosts static frontend files (HTML/CSS/JS)
- **CloudFront**: CDN in front of S3 (global edge locations)
- **EC2**: API server only
- **Route 53**: DNS (optional, can use EC2 public IP)

**Pros:**
- ✅ Scalable (S3 + CloudFront handles traffic spikes)
- ✅ Fast global delivery (CDN)
- ✅ Separation of concerns
- ✅ Lower EC2 load
- ✅ Built-in caching

**Cons:**
- ❌ More complex setup
- ❌ Need to handle CORS
- ❌ Slightly more expensive

---

### Option 3: Full Production - ALB + EC2 + S3 + CloudFront

**Architecture:**
- **Application Load Balancer (ALB)**: Routes traffic, SSL termination
- **EC2 Auto Scaling Group**: Multiple API instances
- **S3 + CloudFront**: Frontend hosting
- **Route 53**: DNS

**Pros:**
- ✅ Highly available
- ✅ Auto-scaling
- ✅ Load balancing
- ✅ Health checks

**Cons:**
- ❌ Most complex
- ❌ Higher cost
- ❌ Overkill for small deployments

---

## Recommended: Option 2 (S3 + CloudFront + EC2)

### Step 1: Deploy API to EC2

#### 1.1 Launch EC2 Instance

```bash
# Recommended instance type for scraping
# - t3.medium or t3.large (2-4 vCPU, 4-8GB RAM)
# - Ubuntu 22.04 LTS or Amazon Linux 2023
# - Security group: Allow inbound on port 3000 (or 80/443)
```

#### 1.2 Configure Security Group

Inbound rules:
- **Port 3000**: HTTP API (for testing)
- **Port 80**: HTTP (for reverse proxy)
- **Port 443**: HTTPS (for reverse proxy)
- **Port 22**: SSH (your IP only)

#### 1.3 Deploy Docker on EC2

```bash
# SSH into EC2
ssh ec2-user@your-ec2-public-ip

# Install Docker
sudo yum update -y
sudo yum install -y docker
sudo service docker start
sudo usermod -a -G docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in for group changes
exit
ssh ec2-user@your-ec2-public-ip
```

#### 1.4 Deploy Your Application

```bash
# Clone repository
git clone <your-repo-url>
cd panama-scraper

# Create .env file
nano .env
# Paste your environment variables

# Start API
docker-compose up -d api

# Check logs
docker-compose logs -f api
```

#### 1.5 Setup Reverse Proxy (Nginx)

Install Nginx:

```bash
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

Create Nginx config (`/etc/nginx/conf.d/panama-scraper.conf`):

```nginx
server {
    listen 80;
    server_name your-api-domain.com;  # Or use EC2 public IP

    # Redirect HTTP to HTTPS (after SSL setup)
    # return 301 https://$server_name$request_uri;

    # For now, proxy to API
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
        
        # CORS headers (if needed for S3 frontend)
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;
        
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }
}
```

Reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

#### 1.6 Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo yum install -y certbot python3-certbot-nginx

# Get certificate (requires domain name pointing to EC2)
sudo certbot --nginx -d your-api-domain.com

# Auto-renewal (already set up by certbot)
sudo certbot renew --dry-run
```

#### 1.7 Enable Auto-Start on Reboot

Create systemd service (`/etc/systemd/system/panama-scraper.service`):

```ini
[Unit]
Description=Panama Scraper API
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ec2-user/panama-scraper
ExecStart=/usr/local/bin/docker-compose up -d api
ExecStop=/usr/local/bin/docker-compose down
User=ec2-user
Group=ec2-user

[Install]
WantedBy=multi-user.target
```

Enable service:

```bash
sudo systemctl enable panama-scraper
sudo systemctl start panama-scraper
```

---

### Step 2: Deploy Frontend to S3 + CloudFront

#### 2.1 Prepare Frontend Files

The frontend needs to know the API URL. Update `public/subscribe.html` (or create a config file):

```javascript
// At the top of subscribe.html, add:
const API_BASE_URL = 'https://your-api-domain.com';
// Or use environment detection:
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000'
  : 'https://your-api-domain.com';
```

#### 2.2 Create S3 Bucket

```bash
# Using AWS CLI (install if needed)
aws s3 mb s3://panama-scraper-frontend --region us-east-1

# Enable static website hosting
aws s3 website s3://panama-scraper-frontend \
  --index-document subscribe.html \
  --error-document subscribe.html
```

Or via AWS Console:
1. Create bucket: `panama-scraper-frontend`
2. Properties → Static website hosting → Enable
3. Index document: `subscribe.html`
4. Error document: `subscribe.html`

#### 2.3 Upload Frontend Files

```bash
# From your local machine
cd panama-scraper

# Update API URL in HTML files
# (You may want to script this)

# Upload to S3
aws s3 sync public/ s3://panama-scraper-frontend/ \
  --acl public-read \
  --exclude "*.git*"

# Or via console: Upload all files from public/ directory
```

#### 2.4 Configure CORS on S3

Create CORS config (`cors.json`):

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

Apply CORS:

```bash
aws s3api put-bucket-cors \
  --bucket panama-scraper-frontend \
  --cors-configuration file://cors.json
```

#### 2.5 Create CloudFront Distribution

**Via AWS Console:**

1. **CloudFront** → Create Distribution
2. **Origin Domain**: Select your S3 bucket (not website endpoint)
3. **Viewer Protocol Policy**: Redirect HTTP to HTTPS
4. **Allowed HTTP Methods**: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
5. **Cache Policy**: CachingDisabled (or custom for API calls)
6. **Origin Request Policy**: AllViewer (forward all headers)
7. **Price Class**: Use All Edge Locations (or cheapest)
8. **Alternate Domain Names (CNAMEs)**: `your-frontend-domain.com`
9. **SSL Certificate**: Request or upload certificate
10. Create Distribution

**Important Settings:**
- **Default Root Object**: `subscribe.html`
- **Error Pages**: 
  - 403 → `/subscribe.html` (for SPA routing)
  - 404 → `/subscribe.html`

#### 2.6 Update API URL in Frontend

After CloudFront is created, update the frontend API URL:

```bash
# Download, update, re-upload
aws s3 cp s3://panama-scraper-frontend/subscribe.html ./subscribe.html.tmp

# Edit to update API_BASE_URL
nano subscribe.html.tmp

# Re-upload
aws s3 cp ./subscribe.html.tmp s3://panama-scraper-frontend/subscribe.html --acl public-read

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

---

### Step 3: Setup DNS (Route 53)

#### 3.1 Domain Setup

1. **Register domain** (or use existing)
2. **Create hosted zone** in Route 53
3. **Update nameservers** at your registrar

#### 3.2 Create Records

**API (EC2):**
- Type: A
- Name: `api.yourdomain.com` (or root domain)
- Value: EC2 public IP (or ALB DNS name)

**Frontend (CloudFront):**
- Type: A (Alias)
- Name: `app.yourdomain.com` (or root domain)
- Alias: Yes
- Alias Target: CloudFront distribution

---

### Step 4: Update Frontend Code for API Connection

#### 4.1 Update API Base URL Function

In `public/subscribe.html`, add:

```javascript
function getApiBase() {
  // Production: Use your API domain
  if (window.location.hostname !== 'localhost' && 
      window.location.hostname !== '127.0.0.1') {
    return 'https://api.yourdomain.com';  // Your EC2 API domain
  }
  // Development
  return 'http://localhost:3000';
}
```

#### 4.2 Update All API Calls

Ensure all `fetch()` calls use `getApiBase()`:

```javascript
const response = await fetch(`${getApiBase()}/api/endpoint`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

---

## Alternative: Option 1 (Simpler - EC2 Only)

If you want the simplest setup, serve everything from EC2:

### Steps:

1. **Deploy API to EC2** (same as above, Step 1.1-1.4)

2. **Nginx serves static files directly:**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Serve static files
    location / {
        root /home/ec2-user/panama-scraper/public;
        try_files $uri $uri/ /subscribe.html;
    }

    # API endpoints
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. **Copy files to EC2:**

```bash
# On EC2
cd /home/ec2-user/panama-scraper
# Files are already there from git clone
```

4. **Setup SSL** (Let's Encrypt, same as above)

---

## Cost Estimation

### Option 1 (EC2 Only):
- EC2 t3.medium: ~$30/month
- Domain: ~$12/year
- **Total: ~$30-40/month**

### Option 2 (S3 + CloudFront + EC2):
- EC2 t3.medium: ~$30/month
- S3: ~$0.50/month (for small sites)
- CloudFront: ~$1-5/month (depending on traffic)
- Data transfer: ~$1-10/month
- Domain: ~$12/year
- **Total: ~$35-50/month**

### Option 3 (Full Production):
- ALB: ~$20/month
- EC2 instances: ~$60/month (2x t3.medium)
- S3 + CloudFront: ~$5-10/month
- **Total: ~$85-100/month**

---

## Security Best Practices

1. **Security Groups**: Only open necessary ports
2. **SSL/TLS**: Always use HTTPS
3. **Environment Variables**: Store secrets in AWS Systems Manager Parameter Store
4. **Backup**: Regular backups of `/data` directory
5. **Monitoring**: CloudWatch alarms for API health
6. **Rate Limiting**: Add rate limiting to API (express-rate-limit)

---

## Monitoring

### CloudWatch Alarms

Create alarms for:
- EC2 CPU utilization > 80%
- API health check failures
- Disk space < 20%

### Logs

```bash
# API logs
docker-compose logs -f api

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Troubleshooting

### Frontend Can't Reach API

1. **Check CORS headers** on API
2. **Verify security group** allows traffic
3. **Check API URL** in frontend code
4. **Test API directly**: `curl https://api.yourdomain.com/health`

### CloudFront Not Updating

```bash
# Invalidate cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

### EC2 Out of Memory

Increase instance size or add swap:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## Quick Start Script

Save as `deploy-ec2.sh`:

```bash
#!/bin/bash
# Deploy API to EC2

EC2_HOST="ec2-user@your-ec2-ip"
APP_DIR="panama-scraper"

# Copy files
rsync -avz --exclude 'node_modules' --exclude '.git' \
  ./ $EC2_HOST:~/$APP_DIR/

# Deploy
ssh $EC2_HOST << 'EOF'
cd panama-scraper
docker-compose pull
docker-compose up -d --build api
docker-compose logs -f api
EOF
```

Make executable: `chmod +x deploy-ec2.sh`
Run: `./deploy-ec2.sh`

