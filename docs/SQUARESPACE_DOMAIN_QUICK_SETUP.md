# Quick Setup: Use Squarespace Domain with AWS (No Transfer)

This is the **fastest way** to use your Squarespace-owned domain with your AWS CloudFront/S3 frontend. No domain transfer needed - takes about 15 minutes!

---

## Option 1: Direct DNS Records in Squarespace (Fastest - ~5 minutes)

This is the simplest approach - just add DNS records in Squarespace pointing to your AWS resources.

### Step 1: Get Your CloudFront Distribution Domain

1. Go to **AWS Console** → **CloudFront**
2. Find your distribution (or create one if you haven't)
3. Copy the **Domain Name** (e.g., `d1234567890abc.cloudfront.net`)

**Don't have CloudFront yet?** See "Set Up CloudFront First" section below.

### Step 2: Add CNAME Record in Squarespace

1. Log into **Squarespace**
2. Go to **Settings** → **Domains**
3. Click on your domain
4. Go to **DNS Settings** (or **Advanced** → **DNS Settings**)
5. Click **Add Record** or **Custom Records**
6. Configure:
   - **Type**: **CNAME**
   - **Host**: 
     - For subdomain: `app` (creates `app.yourdomain.com`)
     - For root domain: `@` or leave blank (for `yourdomain.com`)
   - **Data/Points to**: Your CloudFront domain (e.g., `d1234567890abc.cloudfront.net`)
   - **TTL**: 3600 (or default)
7. Click **Save**

**Note:** If you want to use the root domain (`yourdomain.com`), Squarespace may require using an **A record** with CloudFront IPs instead of CNAME. See Option 2 below.

### Step 3: Configure CloudFront with Your Domain

1. Go to **AWS Console** → **CloudFront**
2. Click on your distribution
3. Click **Edit**
4. Scroll to **Alternate Domain Names (CNAMEs)**
5. Add your domain: `app.yourdomain.com` (or `yourdomain.com`)
6. **SSL Certificate**: 
   - If you have one in ACM, select it
   - If not, see "Get SSL Certificate" section below
7. Click **Save changes**

**Wait 10-15 minutes** for CloudFront to deploy.

### Step 4: Update API CORS Settings

On your EC2 instance (or wherever your API runs):

```bash
# SSH into EC2
ssh -i your-key.pem ec2-user@your-ec2-ip

# Edit .env
cd ~/panama-scraper
nano .env
```

Add or update:
```bash
CORS_ORIGINS=https://app.yourdomain.com,https://www.yourdomain.com
```

Restart API:
```bash
# Docker Compose
docker-compose restart api

# Or systemd
sudo systemctl restart panama-scraper-api
```

### Step 5: Wait for DNS Propagation

- DNS changes usually take effect in **15 minutes to 2 hours**
- Can take up to 48 hours (rare)
- Test with: `dig app.yourdomain.com` or use https://dnschecker.org

### Step 6: Test

1. Visit `https://app.yourdomain.com`
2. Should load your frontend
3. Check browser console for CORS errors
4. Test API connection

**Done!** That's it - no transfer needed.

---

## Option 2: Use Root Domain (yourdomain.com)

If you want to use the root domain instead of a subdomain:

### Squarespace Limitation

Squarespace may not allow CNAME records for the root domain (`@`). You have two options:

### Option 2A: Use A Records (If Squarespace Allows)

1. Get CloudFront IP addresses (this is tricky - CloudFront uses many IPs)
2. **Better approach**: Use Route 53 for DNS (see Option 3 below)

### Option 2B: Use Subdomain (Recommended)

Just use `app.yourdomain.com` or `scraper.yourdomain.com` - works perfectly with CNAME.

---

## Option 3: Use Route 53 for DNS Only (More Control)

If you want to manage DNS in AWS but keep domain in Squarespace:

### Step 1: Create Hosted Zone in Route 53

1. Go to **AWS Console** → **Route 53**
2. Click **Hosted zones** → **Create hosted zone**
3. **Domain name**: `yourdomain.com`
4. **Type**: Public hosted zone
5. Click **Create**

### Step 2: Get Route 53 Name Servers

1. In your hosted zone, you'll see 4 **NS records**
2. Copy all 4 name server values (e.g., `ns-123.awsdns-12.com`)

### Step 3: Update Name Servers in Squarespace

1. Go to **Squarespace** → **Settings** → **Domains** → Your Domain
2. Look for **Name Servers** or **DNS Settings**
3. **Change name servers** to the 4 Route 53 name servers
4. Save

**Wait 24-48 hours** for name server changes to propagate.

### Step 4: Create DNS Records in Route 53

1. In Route 53 hosted zone, click **Create record**
2. **Record name**: `app` (for subdomain) or leave blank (for root)
3. **Record type**: **CNAME**
4. **Value**: Your CloudFront domain
5. Click **Create records**

### Step 5: Configure CloudFront

Same as Step 3 in Option 1 above.

**This gives you more control** but takes longer (name server changes take 24-48 hours).

---

## Set Up CloudFront First (If You Haven't)

If you don't have CloudFront set up yet:

### Step 1: Create CloudFront Distribution

1. Go to **AWS Console** → **CloudFront**
2. Click **Create Distribution**
3. **Origin Domain**: Select your S3 bucket
   - Use: `panama-scraper-frontend.s3.us-east-2.amazonaws.com` (REST endpoint)
   - **NOT** the website endpoint
4. **Origin Path**: Leave blank
5. **Viewer Protocol Policy**: **Redirect HTTP to HTTPS**
6. **Allowed HTTP Methods**: **GET, HEAD, OPTIONS**
7. **Default Root Object**: `index.html`
8. Click **Create Distribution**

**Wait 10-15 minutes** for deployment.

### Step 2: Get SSL Certificate (For Custom Domain)

1. Go to **AWS Certificate Manager (ACM)**
2. **Important**: Make sure you're in **us-east-1** region (CloudFront requirement)
3. Click **Request a certificate**
4. **Domain names**: 
   - `app.yourdomain.com` (or your domain)
   - Or `*.yourdomain.com` for wildcard
5. **Validation**: **DNS validation**
6. Click **Request**

### Step 3: Validate Certificate

1. Click on the certificate
2. Expand **Domains** section
3. Click **Create record in Route 53** (if using Route 53) OR
4. **Copy the CNAME record** and add it to Squarespace DNS:
   - Go to Squarespace → DNS Settings
   - Add CNAME record with the validation name and value
5. Wait 5-10 minutes for validation

### Step 4: Attach Certificate to CloudFront

1. Go back to **CloudFront** → Your distribution → **Edit**
2. **Alternate Domain Names**: Add `app.yourdomain.com`
3. **SSL Certificate**: Select your validated certificate
4. Click **Save changes**

**Wait 10-15 minutes** for deployment.

---

## Get SSL Certificate (Detailed Steps)

### In AWS Certificate Manager:

1. **Switch to us-east-1 region** (required for CloudFront)
2. Click **Request a certificate**
3. **Request a public certificate** → Next
4. **Domain names**:
   - For subdomain: `app.yourdomain.com`
   - For wildcard: `*.yourdomain.com` (covers all subdomains)
5. **Validation method**: **DNS validation** (recommended)
6. Click **Request**

### Validate Certificate:

**If using Squarespace DNS directly:**
1. In ACM, click on your certificate
2. Expand **Domains** → Click on your domain
3. You'll see a **CNAME record** to add
4. Copy the **Name** and **Value**
5. In Squarespace → DNS Settings → Add CNAME:
   - **Host**: The name from ACM (e.g., `_abc123.yourdomain.com`)
   - **Points to**: The value from ACM (e.g., `_xyz789.acm-validations.aws.`)
6. Wait 5-10 minutes for validation

**If using Route 53:**
1. In ACM, click **Create record in Route 53**
2. It will automatically create the validation record

---

## Quick Reference: DNS Record Types

### CNAME Record (For Subdomains)
- **Type**: CNAME
- **Host**: `app`
- **Points to**: `d1234567890abc.cloudfront.net`
- **Creates**: `app.yourdomain.com` → CloudFront

### A Record (For Root Domain - If Needed)
- **Type**: A
- **Host**: `@` or blank
- **Points to**: CloudFront IP (not recommended - use subdomain instead)

---

## Troubleshooting

### DNS Not Working

**Check:**
1. **DNS propagation**: Use https://dnschecker.org
2. **CNAME record**: Verify it's correct in Squarespace
3. **CloudFront**: Ensure distribution is deployed
4. **Custom domain**: Verify it's added to CloudFront CNAMEs

**Wait time:**
- DNS changes: 15 minutes to 2 hours (usually)
- Can take up to 48 hours (rare)

### SSL Certificate Issues

**Common problems:**
1. **Certificate not in us-east-1**: CloudFront requires us-east-1
2. **Certificate not validated**: Complete DNS validation
3. **Wrong domain**: Ensure certificate covers exact domain

### CORS Errors

**Fix:**
1. Update `CORS_ORIGINS` in `.env` on EC2
2. Restart API service
3. Use `https://` not `http://` in CORS_ORIGINS
4. Check exact domain matches (no trailing slash)

### CloudFront Not Updating

**Solution:**
```bash
# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

---

## Comparison: Options Summary

| Option | Speed | Complexity | Control |
|-------|-------|-----------|---------|
| **Option 1: Direct DNS in Squarespace** | ⚡ Fastest (15 min) | ✅ Simple | ⚠️ Limited to Squarespace |
| **Option 3: Route 53 DNS** | 🐌 Slower (24-48 hrs) | ⚠️ Medium | ✅ Full AWS control |

**Recommendation:** Use **Option 1** for speed, **Option 3** if you want more DNS control.

---

## Quick Checklist

**For Option 1 (Fastest):**
- [ ] Get CloudFront distribution domain
- [ ] Add CNAME record in Squarespace
- [ ] Configure CloudFront with custom domain
- [ ] Get SSL certificate in ACM (us-east-1)
- [ ] Validate certificate via DNS
- [ ] Update API CORS settings
- [ ] Wait for DNS propagation (15 min - 2 hrs)
- [ ] Test domain access

**Total time: ~15-30 minutes** (plus DNS propagation wait)

---

## Next Steps After Setup

1. **Deploy frontend** with updated API URL:
   ```bash
   export CLOUDFRONT_DIST_ID="your-dist-id"
   ./scripts/deploy-frontend-s3.sh "http://your-ec2-ip:3000"
   ```

2. **Test everything**:
   - Visit your domain
   - Test API connection
   - Submit a test job

3. **Set up monitoring** (optional):
   - CloudWatch alarms
   - Health checks
   - Logging

---

That's it! You can use your Squarespace domain with AWS in about 15 minutes without transferring anything.

