# Step-by-Step: Deploy Frontend to S3 + CloudFront

Complete walkthrough for deploying the Panama Scraper frontend to AWS S3 and CloudFront.

---

## Prerequisites

### 1. Install AWS CLI

**On macOS:**
```bash
brew install awscli
```

**On Linux (EC2):**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**On Windows:**
Download from: https://aws.amazon.com/cli/

### 2. Configure AWS Credentials

```bash
# Run this command and enter your credentials
aws configure

# You'll be prompted for:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region (e.g., us-east-1)
# - Default output format (json)
```

**Get your credentials:**
1. Go to AWS Console → IAM → Users
2. Click your user → Security credentials
3. Create access key → Download CSV

**Verify it works:**
```bash
aws sts get-caller-identity
# Should return your AWS account info
```

---

## Step 1: Create S3 Bucket

### Option A: Using AWS CLI

```bash
# Set your bucket name (must be globally unique)
BUCKET_NAME="panama-scraper-frontend-$(date +%s)"

# Create bucket (us-east-1)
aws s3 mb s3://$BUCKET_NAME --region us-east-1

# Or specify a different region
aws s3 mb s3://$BUCKET_NAME --region us-west-2

# Save the bucket name for later
echo "export S3_BUCKET=$BUCKET_NAME" >> ~/.bashrc
export S3_BUCKET=$BUCKET_NAME
```

### Option B: Using AWS Console

1. Go to **S3** in AWS Console
2. Click **Create bucket**
3. **Bucket name**: `panama-scraper-frontend` (or your unique name)
4. **AWS Region**: Choose closest to you (e.g., `us-east-1`)
5. **Object Ownership**: ACLs disabled (recommended)
6. **Block Public Access**: **Uncheck "Block all public access"** (we need public access for website)
7. **Bucket Versioning**: Disable (unless you want versioning)
8. **Default encryption**: Enable (optional but recommended)
9. Click **Create bucket**

**Note the bucket name** - you'll need it for all future steps.

---

## Step 2: Configure S3 for Static Website Hosting

### Option A: Using AWS CLI

```bash
# Enable static website hosting
aws s3 website s3://$S3_BUCKET \
  --index-document subscribe.html \
  --error-document subscribe.html
```

### Option B: Using AWS Console

1. Go to your S3 bucket
2. Click **Properties** tab
3. Scroll to **Static website hosting**
4. Click **Edit**
5. **Static website hosting**: Enable
6. **Hosting type**: Host a static website
7. **Index document**: `subscribe.html`
8. **Error document**: `subscribe.html` (for SPA routing)
9. Click **Save changes**

**Note the website endpoint URL** - it will look like:
```
http://panama-scraper-frontend.s3-website-us-east-1.amazonaws.com
```

---

## Step 3: Configure CORS (Cross-Origin Resource Sharing)

This allows your frontend to make API calls to your EC2 API.

### Option A: Using AWS CLI

Create a CORS configuration file:

```bash
cat > cors.json << 'EOF'
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

# Apply CORS configuration
aws s3api put-bucket-cors \
  --bucket $S3_BUCKET \
  --cors-configuration file://cors.json
```

### Option B: Using AWS Console

1. Go to your S3 bucket
2. Click **Permissions** tab
3. Scroll to **Cross-origin resource sharing (CORS)**
4. Click **Edit**
5. Paste this configuration:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

**Important**: Do NOT include `OPTIONS` in AllowedMethods. S3 automatically handles OPTIONS requests for CORS preflight - including it will cause an error.

6. Click **Save changes**

---

## Step 4: Set Bucket Policy (Make Files Public)

### Option A: Using AWS CLI

```bash
# Get your account ID (needed for policy)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Create bucket policy
cat > bucket-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$S3_BUCKET/*"
    }
  ]
}
EOF

# Apply policy
aws s3api put-bucket-policy \
  --bucket $S3_BUCKET \
  --policy file://bucket-policy.json
```

### Option B: Using AWS Console

1. Go to your S3 bucket
2. Click **Permissions** tab
3. Scroll to **Bucket policy**
4. Click **Edit**
5. Paste this policy (replace `YOUR_BUCKET_NAME`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```

6. Click **Save changes**

---

## Step 5: Update Frontend with API URL

Before uploading, we need to set the API URL in the frontend files.

### Get Your API URL

Your API should be running on EC2. The URL will be:
- `http://your-ec2-ip:3000` (if testing)
- `https://api.yourdomain.com` (if you have a domain)

### Update Frontend Files

```bash
# From your local machine, in the panama-scraper directory
export API_URL="https://api.yourdomain.com"  # Replace with your actual API URL

# Use the deployment script (recommended)
./scripts/deploy-frontend-s3.sh "$API_URL"

# Or manually update files
```

**Manual update:**
```bash
# Create a temporary directory
TMP_DIR=$(mktemp -d)

# Copy public files
cp -r public/* "$TMP_DIR/"

# Update API URLs in HTML files
for html_file in "$TMP_DIR"/*.html; do
  if [ -f "$html_file" ]; then
    # Inject API_BASE_URL before closing </head>
    sed -i.bak "s|</head>|<script>window.API_BASE_URL = '$API_URL';</script></head>|g" "$html_file"
    rm -f "$html_file.bak"
  fi
done
```

---

## Step 6: Upload Files to S3

### Option A: Using Deployment Script (Recommended)

```bash
# Make sure script is executable
chmod +x scripts/deploy-frontend-s3.sh

# Deploy (will update API URLs and upload)
export S3_BUCKET="panama-scraper-frontend"  # Your bucket name
export API_URL="https://api.yourdomain.com"  # Your API URL

./scripts/deploy-frontend-s3.sh "$API_URL"
```

### Option B: Manual Upload

```bash
# Upload all files from public/ directory
aws s3 sync public/ s3://$S3_BUCKET/ \
  --acl public-read \
  --exclude "*.git*" \
  --delete

# Verify upload
aws s3 ls s3://$S3_BUCKET/
```

### Option C: Using AWS Console

1. Go to your S3 bucket
2. Click **Upload**
3. Click **Add files**
4. Select all files from `public/` directory
5. Under **Permissions**:
   - **Predefined ACLs**: Grant public-read access
6. Click **Upload**

---

## Step 7: Test S3 Website

Before setting up CloudFront, test the S3 website:

```bash
# Get the website endpoint
aws s3api get-bucket-website --bucket $S3_BUCKET

# Or find it in Console: Properties → Static website hosting
# It will be: http://$S3_BUCKET.s3-website-us-east-1.amazonaws.com
```

Open the website endpoint in your browser and verify:
- ✅ Page loads
- ✅ No console errors
- ✅ API calls work (check browser Network tab)

---

## Step 8: Create CloudFront Distribution

### Option A: Using AWS CLI

```bash
# Create CloudFront distribution
aws cloudfront create-distribution \
  --origin-domain-name "$S3_BUCKET.s3.us-east-1.amazonaws.com" \
  --default-root-object "subscribe.html" \
  --viewer-protocol-policy "redirect-to-https" \
  --enabled
```

**Note:** CLI method is complex. Use Console for easier setup.

### Option B: Using AWS Console (Recommended)

1. Go to **CloudFront** in AWS Console
2. Click **Create distribution**

#### Origin Settings:

3. **Origin domain**: 
   - Click dropdown → Select your S3 bucket
   - **Important**: Select the bucket name (not the website endpoint)
   - Example: `panama-scraper-frontend.s3.us-east-1.amazonaws.com`

4. **Origin path**: Leave empty

5. **Name**: Auto-filled (or customize)

6. **Origin access**: 
   - Select **Origin access control settings (recommended)**
   - Click **Create control setting**
     - **Name**: `panama-scraper-oac`
     - **Origin type**: S3
     - **Signing behavior**: Sign requests
     - **Signing protocol**: SigV4
     - Click **Create**
   - Select the control setting you just created

#### Default Cache Behavior:

7. **Viewer protocol policy**: **Redirect HTTP to HTTPS**

8. **Allowed HTTP methods**: 
   - Select **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
   - (We need POST/PUT for API calls)

9. **Cache policy**: 
   - Select **CachingDisabled** (or create custom)
   - This ensures API calls aren't cached

10. **Origin request policy**: 
    - Select **AllViewer** (forwards all headers)

11. **Response headers policy**: Leave default

#### Settings:

12. **Price class**: 
    - **Use all edge locations** (best performance)
    - Or **Use only North America and Europe** (cheaper)

13. **Alternate domain names (CNAMEs)**: 
    - Leave empty for now (add after DNS setup)
    - Or add: `app.yourdomain.com`

14. **Custom SSL certificate**: 
    - Leave default (CloudFront default certificate)
    - Or request/upload your own certificate

15. **Default root object**: `subscribe.html`

16. **Comment**: `Panama Scraper Frontend`

17. Click **Create distribution**

**Wait 5-15 minutes** for distribution to deploy.

---

## Step 9: Update S3 Bucket Policy for CloudFront

After creating CloudFront distribution, you need to update S3 bucket policy to allow CloudFront access.

### Get CloudFront OAC ID

1. Go to CloudFront → Your distribution
2. Click **Origins** tab
3. Click your origin
4. Note the **Origin access control** ID (looks like: `E1234567890ABC`)

### Update Bucket Policy

```bash
# Get your account ID and CloudFront OAC ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
OAC_ID="E1234567890ABC"  # Replace with your OAC ID from CloudFront

# Create updated bucket policy
cat > bucket-policy-cloudfront.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$S3_BUCKET/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::$ACCOUNT_ID:distribution/YOUR_DISTRIBUTION_ID"
        }
      }
    }
  ]
}
EOF
```

**Or via Console:**

1. Go to S3 → Your bucket → Permissions
2. Edit bucket policy
3. Use this policy (replace values):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

**Get Distribution ID:**
- CloudFront → Your distribution → General tab → Distribution ID

---

## Step 10: Configure Error Pages (For SPA Routing)

1. Go to CloudFront → Your distribution
2. Click **Error pages** tab
3. Click **Create custom error response**

**For 403 errors:**
- **HTTP error code**: 403
- **Error caching minimum TTL**: 10
- **Customize error response**: Yes
- **Response page path**: `/subscribe.html`
- **HTTP response code**: 200
- Click **Create custom error response**

**For 404 errors:**
- **HTTP error code**: 404
- **Error caching minimum TTL**: 10
- **Customize error response**: Yes
- **Response page path**: `/subscribe.html`
- **HTTP response code**: 200
- Click **Create custom error response**

---

## Step 11: Test CloudFront Distribution

After deployment (5-15 minutes):

1. Go to CloudFront → Your distribution
2. Copy the **Distribution domain name** (e.g., `d1234abcd.cloudfront.net`)
3. Open in browser: `https://d1234abcd.cloudfront.net`
4. Verify:
   - ✅ Page loads
   - ✅ HTTPS works
   - ✅ API calls work (check browser console)
   - ✅ No CORS errors

---

## Step 12: Setup Custom Domain (Optional)

### 12.1 Request SSL Certificate

1. Go to **Certificate Manager** (ACM)
2. Click **Request certificate**
3. **Domain names**: 
   - `app.yourdomain.com`
   - `*.yourdomain.com` (optional, for subdomains)
4. **Validation method**: DNS validation (recommended)
5. Click **Request**
6. Follow DNS validation steps (add CNAME records to your DNS)

### 12.2 Update CloudFront Distribution

1. Go to CloudFront → Your distribution → General
2. Click **Edit**
3. **Alternate domain names (CNAMEs)**: Add `app.yourdomain.com`
4. **Custom SSL certificate**: Select your certificate
5. Click **Save changes**

### 12.3 Update DNS

1. Go to **Route 53** (or your DNS provider)
2. Create record:
   - **Type**: A (Alias)
   - **Name**: `app` (or root domain)
   - **Alias**: Yes
   - **Alias target**: Your CloudFront distribution
3. Save

Wait 5-10 minutes for DNS propagation.

---

## Step 13: Setup Auto-Deployment Script

Create a script to automate future deployments:

```bash
# Save as: deploy-frontend.sh
#!/bin/bash
set -e

API_URL="${1:-https://api.yourdomain.com}"
S3_BUCKET="${S3_BUCKET:-panama-scraper-frontend}"
CLOUDFRONT_DIST_ID="${CLOUDFRONT_DIST_ID:-}"

echo "🚀 Deploying frontend..."
echo "   API URL: $API_URL"
echo "   S3 Bucket: $S3_BUCKET"

# Update and upload
./scripts/deploy-frontend-s3.sh "$API_URL"

# Invalidate CloudFront if distribution ID is set
if [ -n "$CLOUDFRONT_DIST_ID" ]; then
  echo "   Invalidating CloudFront cache..."
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DIST_ID" \
    --paths "/*"
fi

echo "✅ Deployment complete!"
```

Make executable:
```bash
chmod +x deploy-frontend.sh
```

Use it:
```bash
export CLOUDFRONT_DIST_ID="E1234567890ABC"
./deploy-frontend.sh "https://api.yourdomain.com"
```

---

## Step 14: Verify Everything Works

### Test Checklist:

- [ ] S3 website loads: `http://$BUCKET.s3-website-us-east-1.amazonaws.com`
- [ ] CloudFront loads: `https://$DIST_ID.cloudfront.net`
- [ ] HTTPS works (no mixed content warnings)
- [ ] Frontend can reach API (check browser console)
- [ ] No CORS errors
- [ ] Forms submit correctly
- [ ] Custom domain works (if configured)

### Debug API Connection:

Open browser console on your frontend and run:

```javascript
// Test API connection
fetch('https://api.yourdomain.com/health')
  .then(r => r.json())
  .then(data => console.log('API Health:', data))
  .catch(err => console.error('API Error:', err));
```

---

## Troubleshooting

### Files Not Updating in CloudFront

```bash
# Invalidate cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

### CORS Errors

1. Check S3 CORS configuration
2. Verify API has CORS headers
3. Check browser console for specific error

### 403 Forbidden from S3

1. Verify bucket policy allows CloudFront access
2. Check Origin Access Control is configured
3. Verify CloudFront distribution ID in bucket policy

### API Calls Failing

1. Check API URL in frontend code
2. Verify API is accessible: `curl https://api.yourdomain.com/health`
3. Check CORS headers on API
4. Verify security groups allow traffic

---

## Cost Estimation

**S3:**
- Storage: ~$0.023/GB/month (negligible for small sites)
- Requests: ~$0.0004 per 1,000 requests

**CloudFront:**
- Data transfer out: ~$0.085/GB (first 10TB)
- Requests: ~$0.0075 per 10,000 HTTPS requests

**Typical monthly cost for small site:**
- S3: ~$0.50
- CloudFront: ~$1-5 (depending on traffic)
- **Total: ~$2-6/month**

---

## Next Steps

1. ✅ Frontend deployed to S3 + CloudFront
2. ✅ API running on EC2
3. 🔄 Setup monitoring (CloudWatch)
4. 🔄 Setup CI/CD (GitHub Actions)
5. 🔄 Configure custom domain
6. 🔄 Enable CloudFront logging

---

## Quick Reference Commands

```bash
# Deploy frontend
./scripts/deploy-frontend-s3.sh "https://api.yourdomain.com"

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"

# Check S3 files
aws s3 ls s3://$S3_BUCKET/

# Get CloudFront distribution info
aws cloudfront get-distribution --id $DIST_ID

# Test S3 website
curl http://$S3_BUCKET.s3-website-us-east-1.amazonaws.com
```

---

For EC2 API setup, see `EC2_SETUP.md`
For full AWS deployment, see `docs/AWS_DEPLOYMENT.md`

