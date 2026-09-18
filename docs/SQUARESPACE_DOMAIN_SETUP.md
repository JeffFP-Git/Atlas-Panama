# Connecting Squarespace Domain to S3/CloudFront Frontend

This guide walks you through connecting your Squarespace domain to your AWS-hosted frontend.

---

## Prerequisites

- Your frontend is already deployed to S3: `panama-scraper-frontend`
- You have a Squarespace domain (e.g., `yourdomain.com` or `app.yourdomain.com`)
- AWS CLI configured with appropriate permissions
- Access to your Squarespace DNS settings

---

## Step 1: Set Up CloudFront Distribution (If Not Already Done)

S3 website endpoints don't support custom domains with HTTPS. You need CloudFront for that.

### Option A: Create CloudFront Distribution via AWS Console

1. Go to **CloudFront** in AWS Console
2. Click **Create Distribution**
3. **Origin Domain**: Select your S3 bucket (e.g., `panama-scraper-frontend.s3.us-east-2.amazonaws.com`)
   - **Important**: Use the REST API endpoint (s3.us-east-2.amazonaws.com), NOT the website endpoint
4. **Origin Path**: Leave blank
5. **Name**: Auto-generated (or give it a name)
6. **Viewer Protocol Policy**: **Redirect HTTP to HTTPS** (recommended)
7. **Allowed HTTP Methods**: **GET, HEAD, OPTIONS**
8. **Cache Policy**: **CachingOptimized** (or **CachingDisabled** for development)
9. **Alternate Domain Names (CNAMEs)**: Add your Squarespace domain here
   - Example: `app.yourdomain.com` or `scraper.yourdomain.com`
10. **SSL Certificate**: 
    - If you have a certificate in ACM (AWS Certificate Manager), select it
    - If not, CloudFront can request one for you (takes ~20 minutes)
11. **Default Root Object**: `index.html` (or your main HTML file)
12. Click **Create Distribution**

**Wait 10-15 minutes** for the distribution to deploy.

### Option B: Create CloudFront Distribution via AWS CLI

```bash
# Get your S3 bucket region
BUCKET_REGION=$(aws s3api get-bucket-location --bucket panama-scraper-frontend --query 'LocationConstraint' --output text)
if [ "$BUCKET_REGION" = "None" ] || [ -z "$BUCKET_REGION" ]; then
  BUCKET_REGION="us-east-1"
fi

# Create CloudFront distribution
aws cloudfront create-distribution \
  --origin-domain-name "panama-scraper-frontend.s3.$BUCKET_REGION.amazonaws.com" \
  --default-root-object "index.html" \
  --viewer-protocol-policy "redirect-to-https" \
  --aliases "app.yourdomain.com" \
  --comment "Panama Scraper Frontend"
```

**Note the Distribution ID** - you'll need it for cache invalidation.

---

## Step 2: Request SSL Certificate (If Needed)

If you don't have an SSL certificate for your domain:

1. Go to **AWS Certificate Manager (ACM)** in AWS Console
2. Make sure you're in **us-east-1** region (CloudFront requires certificates in us-east-1)
3. Click **Request a certificate**
4. Select **Request a public certificate**
5. **Domain names**: 
   - Add your domain: `app.yourdomain.com`
   - Or add both: `yourdomain.com` and `*.yourdomain.com` (wildcard)
6. **Validation method**: **DNS validation** (recommended)
7. Click **Request**

**Validate the certificate:**
1. Click on the certificate
2. Expand **Domains** section
3. For each domain, click **Create record in Route 53** (if using Route 53) or copy the CNAME record
4. Add the CNAME record to your Squarespace DNS (see Step 3 below)
5. Wait for validation (usually 5-10 minutes)

---

## Step 3: Configure DNS in Squarespace

1. Log into your Squarespace account
2. Go to **Settings** → **Domains**
3. Click on your domain
4. Go to **DNS Settings** (or **Advanced** → **DNS Settings**)

### Add CloudFront CNAME Record

1. Click **Add Record** or **Custom Records**
2. **Type**: **CNAME**
3. **Host**: 
   - For subdomain: `app` (if using `app.yourdomain.com`)
   - For root domain: `@` or leave blank (if using `yourdomain.com`)
4. **Data/Points to**: Your CloudFront distribution domain
   - Find this in CloudFront console → Your distribution → **Domain name**
   - Example: `d1234567890abc.cloudfront.net`
5. **TTL**: 3600 (or default)
6. **Save**

**Note**: If you want to use the root domain (`yourdomain.com`), you may need to use an **A record** pointing to CloudFront's IP addresses, or use Route 53's alias record. Squarespace may have limitations here - check their documentation.

**For subdomains** (e.g., `app.yourdomain.com`), CNAME works perfectly.

---

## Step 4: Update CloudFront Distribution with Custom Domain

1. Go to **CloudFront** in AWS Console
2. Click on your distribution
3. Click **Edit**
4. Scroll to **Alternate Domain Names (CNAMEs)**
5. Add your domain: `app.yourdomain.com`
6. **SSL Certificate**: Select the certificate you created/validated
7. Click **Save changes**

**Wait 10-15 minutes** for changes to propagate.

---

## Step 5: Update API CORS Settings

Your API needs to allow requests from your new domain.

### On Your EC2 Instance (or wherever your API runs):

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ec2-user@your-ec2-ip

# Navigate to your project
cd ~/panama-scraper

# Edit .env file
nano .env
# or
vi .env
```

Add or update the `CORS_ORIGINS` variable:

```bash
# Add your Squarespace domain (with https://)
CORS_ORIGINS=https://app.yourdomain.com,https://www.yourdomain.com

# If you want to keep the S3 endpoint too:
CORS_ORIGINS=https://app.yourdomain.com,https://panama-scraper-frontend.s3-website.us-east-2.amazonaws.com
```

**Restart your API service:**

```bash
# If using Docker Compose
docker-compose restart api

# If using systemd
sudo systemctl restart panama-scraper-api

# Or if running directly
pm2 restart api
```

---

## Step 6: Update Frontend Deployment Script

Update your deployment to use the new domain:

```bash
# Set your API URL (your EC2 instance or API domain)
export API_URL="http://your-ec2-ip:3000"
# Or if you have an API domain:
# export API_URL="https://api.yourdomain.com"

# Set your CloudFront distribution ID (for cache invalidation)
export CLOUDFRONT_DIST_ID="E1234567890ABC"  # Your actual distribution ID

# Deploy
./scripts/deploy-frontend-s3.sh "$API_URL"
```

The script will:
- Update HTML files with the API URL
- Upload to S3
- Invalidate CloudFront cache

---

## Step 7: Verify Everything Works

1. **Wait for DNS propagation** (can take up to 48 hours, usually 1-2 hours)
2. **Check DNS propagation**: Use `dig` or online tools like `dnschecker.org`
   ```bash
   dig app.yourdomain.com
   # Should return your CloudFront domain
   ```
3. **Test your domain**: Visit `https://app.yourdomain.com`
4. **Test API connection**: Open browser console, check for CORS errors
5. **Test a scrape job**: Submit a job and verify it works

---

## Troubleshooting

### Domain Not Resolving

- **Check DNS records**: Verify CNAME is correct in Squarespace
- **Wait longer**: DNS can take up to 48 hours (usually much faster)
- **Check CloudFront**: Ensure distribution is deployed (Status: Deployed)

### SSL Certificate Issues

- **Certificate not in us-east-1**: CloudFront requires certificates in us-east-1 region
- **Certificate not validated**: Complete DNS validation in ACM
- **Wrong domain**: Ensure certificate covers your exact domain

### CORS Errors

- **Check CORS_ORIGINS**: Verify domain is in `.env` on EC2
- **Restart API**: Changes require API restart
- **Check protocol**: Use `https://` not `http://` in CORS_ORIGINS
- **Check exact domain**: `https://app.yourdomain.com` vs `https://www.app.yourdomain.com` are different

### CloudFront Not Updating

- **Cache invalidation**: Run invalidation after deploying:
  ```bash
  aws cloudfront create-invalidation \
    --distribution-id $CLOUDFRONT_DIST_ID \
    --paths "/*"
  ```
- **Wait for deployment**: CloudFront changes take 10-15 minutes

### Mixed Content Warnings

- **Use HTTPS everywhere**: Ensure API URL uses `https://` if frontend is `https://`
- **Update API URL**: Redeploy frontend with correct API URL

---

## Quick Reference Commands

```bash
# Get CloudFront distribution ID
aws cloudfront list-distributions --query "DistributionList.Items[*].[Id,DomainName,Aliases]" --output table

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"

# Check DNS
dig app.yourdomain.com

# Deploy frontend
export CLOUDFRONT_DIST_ID="YOUR_DIST_ID"
./scripts/deploy-frontend-s3.sh "https://api.yourdomain.com"
```

---

## Next Steps

- Set up a custom domain for your API (optional, but recommended)
- Configure CloudFront caching policies for better performance
- Set up CloudFront access logs for monitoring
- Consider using Route 53 for DNS (more AWS-native, but Squarespace works fine)

