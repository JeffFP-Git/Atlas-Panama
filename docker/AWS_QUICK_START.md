# AWS Quick Start: Frontend + EC2 API

## Option 1: Simple - Everything on EC2 (Recommended for Start)

### Deploy API to EC2

```bash
# 1. Launch EC2 (Ubuntu 22.04, t3.medium)
# 2. SSH into EC2
ssh ubuntu@your-ec2-ip

# 3. Install Docker
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker ubuntu
newgrp docker

# 4. Clone and deploy
git clone <your-repo-url>
cd panama-scraper
nano .env  # Add your credentials

# 5. Start API
docker compose up -d api

# 6. Install Nginx (reverse proxy + static files)
sudo apt install -y nginx

# 7. Create Nginx config
sudo nano /etc/nginx/sites-available/panama-scraper
```

**Nginx Config** (`/etc/nginx/sites-available/panama-scraper`):

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Or EC2 public IP for testing

    # Serve static files from public directory
    location / {
        root /home/ubuntu/panama-scraper/public;
        try_files $uri $uri/ /subscribe.html;
    }

    # API endpoints
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Intro API endpoints
    location ~ ^/(intro|subscribe|health) {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/panama-scraper /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Setup SSL (optional but recommended)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

**Access:**
- Frontend: `http://your-ec2-ip/` or `http://your-domain.com/`
- API: `http://your-ec2-ip/api` or `http://your-domain.com/api`

---

## Option 2: S3 + CloudFront + EC2 (Production)

### 1. Deploy API to EC2 (same as Option 1, steps 1-5)

### 2. Deploy Frontend to S3

```bash
# From your local machine (requires AWS CLI configured)
export S3_BUCKET="panama-scraper-frontend"
export API_URL="https://your-api-domain.com"  # Your EC2 API URL
export CLOUDFRONT_DIST_ID="your-distribution-id"  # Optional

# Run deployment script
./scripts/deploy-frontend-s3.sh "$API_URL"
```

### 3. Create S3 Bucket (one-time setup)

```bash
# Create bucket
aws s3 mb s3://panama-scraper-frontend --region us-east-1

# Enable static website hosting
aws s3 website s3://panama-scraper-frontend \
  --index-document subscribe.html \
  --error-document subscribe.html

# Set CORS
aws s3api put-bucket-cors \
  --bucket panama-scraper-frontend \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }]
  }'
```

### 4. Create CloudFront Distribution (one-time setup)

**Via AWS Console:**

1. Go to **CloudFront** → Create Distribution
2. **Origin Domain**: `panama-scraper-frontend.s3.us-east-1.amazonaws.com`
3. **Viewer Protocol Policy**: Redirect HTTP to HTTPS
4. **Allowed HTTP Methods**: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
5. **Cache Policy**: CachingDisabled
6. **Default Root Object**: `subscribe.html`
7. **Error Pages**:
   - 403 → `/subscribe.html` (200)
   - 404 → `/subscribe.html` (200)
8. Create Distribution

**Save Distribution ID** for future deployments:
```bash
export CLOUDFRONT_DIST_ID="E1234567890ABC"
```

### 5. Setup Auto-Deploy (GitHub Actions / CI)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]
    paths:
      - 'public/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - run: |
          chmod +x scripts/deploy-frontend-s3.sh
          ./scripts/deploy-frontend-s3.sh "${{ secrets.API_URL }}"
        env:
          S3_BUCKET: panama-scraper-frontend
          CLOUDFRONT_DIST_ID: ${{ secrets.CLOUDFRONT_DIST_ID }}
```

---

## Configuration

### Environment Variables Needed

**EC2 API (.env file):**
```bash
RP_USERNAME=your_username
RP_PASSWORD=your_password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=1
SMTP_USER=your-email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=your-email@gmail.com
CAPTCHA_PROVIDER=2captcha
CAPTCHA_API_KEY=your_key
PORT=3000
```

**Local (for S3 deployment):**
```bash
export AWS_PROFILE=your-profile
export S3_BUCKET=panama-scraper-frontend
export API_URL=https://api.yourdomain.com
export CLOUDFRONT_DIST_ID=E1234567890ABC
```

---

## Testing

### Test API

```bash
# From local machine
curl http://your-ec2-ip:3000/health
curl https://api.yourdomain.com/health
```

### Test Frontend

1. **Option 1 (EC2)**: Open `http://your-ec2-ip/` in browser
2. **Option 2 (S3)**: Open `http://panama-scraper-frontend.s3-website-us-east-1.amazonaws.com`
3. **Option 2 (CloudFront)**: Open CloudFront domain name

### Verify API Connection

Open browser console on frontend and check:
```javascript
fetch('https://api.yourdomain.com/health')
  .then(r => r.json())
  .then(console.log)
```

---

## Cost Comparison

| Option | Monthly Cost | Best For |
|--------|-------------|----------|
| Option 1 (EC2 only) | ~$30-40 | Small deployments, testing |
| Option 2 (S3+CF+EC2) | ~$35-50 | Production, global users |
| Option 3 (Full ALB) | ~$85-100 | High availability, scaling |

---

## Troubleshooting

**Frontend can't reach API:**
- Check CORS headers on API
- Verify API URL in browser console
- Check security group allows inbound on port 3000
- Test API directly: `curl https://api.yourdomain.com/health`

**CloudFront shows old content:**
```bash
aws cloudfront create-invalidation \
  --distribution-id $CLOUDFRONT_DIST_ID \
  --paths "/*"
```

**EC2 API not accessible:**
- Check security group rules
- Verify Docker container is running: `docker compose ps`
- Check API logs: `docker compose logs api`

---

For detailed guide, see `docs/AWS_DEPLOYMENT.md`

