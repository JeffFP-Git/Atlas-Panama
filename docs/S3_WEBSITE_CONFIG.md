# Configure S3 for Static Website Hosting

Step-by-step guide to configure your S3 bucket for static website hosting.

---

## Method 1: Using AWS Console (Easier - Recommended)

### Step 1: Enable Static Website Hosting

1. Go to **AWS Console** → **S3**
2. Click on your bucket name (e.g., `panama-scraper-frontend`)
3. Click the **Properties** tab (at the top)
4. Scroll down to find **Static website hosting** section
5. Click **Edit** button

6. Configure the settings:
   - **Static website hosting**: Select **Enable**
   - **Hosting type**: Select **Host a static website**
   - **Index document**: Type `subscribe.html`
   - **Error document**: Type `subscribe.html` (this handles SPA routing)
   - **Redirection rules**: Leave empty

7. Click **Save changes**

8. **Note the website endpoint URL** - it will look like:
   ```
   http://panama-scraper-frontend.s3-website-us-east-1.amazonaws.com
   ```
   Copy this URL - you'll need it later!

---

### Step 2: Configure CORS (Cross-Origin Resource Sharing)

1. Still in your S3 bucket, click the **Permissions** tab
2. Scroll down to **Cross-origin resource sharing (CORS)**
3. Click **Edit** button

4. Paste this CORS configuration:

```json
[
  {
    "AllowedHeaders": [
      "*"
    ],
    "AllowedMethods": [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "HEAD"
    ],
    "AllowedOrigins": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3000
  }
]
```

**Note**: Do NOT include `OPTIONS` in AllowedMethods - S3 handles OPTIONS automatically for CORS preflight requests.

5. Click **Save changes**

---

### Step 3: Set Bucket Policy (Allow Public Access)

**First, unblock public access:**

1. Still in **Permissions** tab
2. Find **Block public access (bucket settings)**
3. Click **Edit** button
4. **Uncheck all 4 boxes**:
   - ❌ Block all public access
   - ❌ Block public access to buckets and objects granted through new access control lists (ACLs)
   - ❌ Block public access to buckets and objects granted through any access control lists (ACLs)
   - ❌ Block public access to buckets and objects granted through new public bucket or access point policies
5. Click **Save changes**
6. Type `confirm` when prompted
7. Click **Confirm**

**Then, add bucket policy:**

1. Still in **Permissions** tab
2. Scroll to **Bucket policy**
3. Click **Edit** button

4. Paste this policy (replace `YOUR_BUCKET_NAME` with your actual bucket name):

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

**Example** (if your bucket is `panama-scraper-frontend`):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::panama-scraper-frontend/*"
    }
  ]
}
```

5. Click **Save changes**

---

## Method 2: Using AWS CLI (Faster for Automation)

### Step 1: Enable Static Website Hosting

```bash
# Replace YOUR_BUCKET_NAME with your actual bucket name
BUCKET_NAME="panama-scraper-frontend"

aws s3 website s3://$BUCKET_NAME \
  --index-document subscribe.html \
  --error-document subscribe.html
```

### Step 2: Configure CORS

Create a file called `cors.json`:

```bash
cat > cors.json << 'EOF'
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
EOF
```

**Note**: Do NOT include `OPTIONS` - S3 handles it automatically.

Apply CORS configuration:

```bash
aws s3api put-bucket-cors \
  --bucket $BUCKET_NAME \
  --cors-configuration file://cors.json
```

### Step 3: Unblock Public Access

```bash
aws s3api put-public-access-block \
  --bucket $BUCKET_NAME \
  --public-access-block-configuration \
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

### Step 4: Set Bucket Policy

Create a file called `bucket-policy.json`:

```bash
# Replace YOUR_BUCKET_NAME with your actual bucket name
cat > bucket-policy.json << EOF
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
EOF
```

Apply bucket policy:

```bash
# Replace YOUR_BUCKET_NAME in the file first, then:
aws s3api put-bucket-policy \
  --bucket $BUCKET_NAME \
  --policy file://bucket-policy.json
```

---

## Verify Configuration

### Check Website Hosting

**Using Console:**
1. Go to S3 → Your bucket → Properties
2. Scroll to **Static website hosting**
3. You should see the website endpoint URL

**Using CLI:**
```bash
aws s3api get-bucket-website --bucket $BUCKET_NAME
```

### Check CORS

**Using CLI:**
```bash
aws s3api get-bucket-cors --bucket $BUCKET_NAME
```

### Check Bucket Policy

**Using CLI:**
```bash
aws s3api get-bucket-policy --bucket $BUCKET_NAME
```

### Test Website

Open the website endpoint in your browser:
```
http://YOUR_BUCKET_NAME.s3-website-us-east-1.amazonaws.com
```

You should see your website (or an error if files aren't uploaded yet).

---

## Quick All-in-One Script

Save this as `setup-s3-website.sh`:

```bash
#!/bin/bash
set -e

BUCKET_NAME="${1:-panama-scraper-frontend}"

if [ -z "$BUCKET_NAME" ]; then
  echo "Usage: $0 <bucket-name>"
  exit 1
fi

echo "🚀 Configuring S3 bucket: $BUCKET_NAME"

# 1. Enable website hosting
echo "   Enabling static website hosting..."
aws s3 website s3://$BUCKET_NAME \
  --index-document subscribe.html \
  --error-document subscribe.html

# 2. Configure CORS
echo "   Configuring CORS..."
cat > /tmp/cors.json << 'EOF'
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
EOF

aws s3api put-bucket-cors \
  --bucket $BUCKET_NAME \
  --cors-configuration file:///tmp/cors.json

# 3. Unblock public access
echo "   Unblocking public access..."
aws s3api put-public-access-block \
  --bucket $BUCKET_NAME \
  --public-access-block-configuration \
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# 4. Set bucket policy
echo "   Setting bucket policy..."
cat > /tmp/bucket-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket $BUCKET_NAME \
  --policy file:///tmp/bucket-policy.json

# 5. Get website endpoint
echo ""
echo "✅ Configuration complete!"
echo ""
echo "Website endpoint:"
aws s3api get-bucket-website --bucket $BUCKET_NAME \
  | grep -oP '(?<=http://)[^"]*' \
  | head -1 \
  | sed 's/^/http:\/\//' || \
  echo "http://$BUCKET_NAME.s3-website-$(aws configure get region).amazonaws.com"
```

Make it executable and run:
```bash
chmod +x setup-s3-website.sh
./setup-s3-website.sh panama-scraper-frontend
```

---

## Troubleshooting

### "Access Denied" when accessing website

**Problem**: Public access is still blocked or bucket policy is wrong

**Solution**:
1. Check **Block public access** is disabled (all unchecked)
2. Verify bucket policy is correct (check JSON syntax)
3. Make sure you replaced `YOUR_BUCKET_NAME` in the policy

### CORS errors in browser

**Problem**: CORS not configured correctly

**Solution**:
1. Verify CORS configuration is saved
2. Check JSON syntax is valid
3. Make sure `AllowedOrigins` includes `*` or your domain

### Website shows "403 Forbidden"

**Problem**: Bucket policy not allowing public read

**Solution**:
1. Check bucket policy allows `s3:GetObject` for `Principal: "*"`
2. Verify resource ARN matches your bucket name
3. Check public access blocks are disabled

### Can't find "Static website hosting" option

**Problem**: Using wrong S3 interface

**Solution**:
1. Make sure you're in the **Properties** tab (not Overview)
2. Scroll down - it's near the bottom
3. If using S3 console v2, look for "Hosting" section

---

## Next Steps

After configuring S3:

1. ✅ Upload your frontend files (see deployment guide)
2. ✅ Test the website endpoint
3. ✅ Create CloudFront distribution (see CloudFront guide)

---

For full deployment guide, see `docs/S3_CLOUDFRONT_DEPLOYMENT.md`

