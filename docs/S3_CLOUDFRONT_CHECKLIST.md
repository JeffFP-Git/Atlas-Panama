# S3 + CloudFront Deployment Checklist

Quick checklist for deploying frontend to S3 and CloudFront.

## Prerequisites
- [ ] AWS CLI installed (`aws --version`)
- [ ] AWS credentials configured (`aws configure`)
- [ ] API running on EC2 (test: `curl http://your-ec2-ip:3000/health`)
- [ ] Know your API URL (e.g., `https://api.yourdomain.com`)

## Step 1: Create S3 Bucket
- [ ] Create bucket: `aws s3 mb s3://panama-scraper-frontend --region us-east-1`
- [ ] Note bucket name: `_________________`

## Step 2: Configure S3 Website Hosting
- [ ] Enable static website hosting
- [ ] Set index document: `subscribe.html`
- [ ] Set error document: `subscribe.html`
- [ ] Note website endpoint: `http://_________________.s3-website-us-east-1.amazonaws.com`

## Step 3: Configure CORS
- [ ] Create `cors.json` file
- [ ] Apply: `aws s3api put-bucket-cors --bucket YOUR_BUCKET --cors-configuration file://cors.json`

## Step 4: Set Bucket Policy
- [ ] Create `bucket-policy.json` file
- [ ] Apply: `aws s3api put-bucket-policy --bucket YOUR_BUCKET --policy file://bucket-policy.json`

## Step 5: Deploy Frontend
- [ ] Set API URL: `export API_URL="https://api.yourdomain.com"`
- [ ] Set bucket: `export S3_BUCKET="panama-scraper-frontend"`
- [ ] Run: `./scripts/deploy-frontend-s3.sh "$API_URL"`
- [ ] Verify upload: `aws s3 ls s3://$S3_BUCKET/`

## Step 6: Test S3 Website
- [ ] Open: `http://YOUR_BUCKET.s3-website-us-east-1.amazonaws.com`
- [ ] Verify page loads
- [ ] Check browser console for errors

## Step 7: Create CloudFront Distribution
- [ ] Go to CloudFront console
- [ ] Create distribution
- [ ] Origin: Select S3 bucket (not website endpoint)
- [ ] Origin access: Create OAC
- [ ] Viewer protocol: Redirect HTTP to HTTPS
- [ ] Allowed methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
- [ ] Cache policy: CachingDisabled
- [ ] Default root: `subscribe.html`
- [ ] Create distribution
- [ ] Wait 5-15 minutes for deployment
- [ ] Note distribution ID: `_________________`
- [ ] Note CloudFront domain: `https://_________________.cloudfront.net`

## Step 8: Update S3 Bucket Policy for CloudFront
- [ ] Get CloudFront OAC ID from distribution
- [ ] Get distribution ID
- [ ] Update bucket policy with CloudFront ARN
- [ ] Apply policy

## Step 9: Configure Error Pages
- [ ] Create custom error response for 403 → `/subscribe.html` (200)
- [ ] Create custom error response for 404 → `/subscribe.html` (200)

## Step 10: Test CloudFront
- [ ] Open: `https://YOUR_DIST_ID.cloudfront.net`
- [ ] Verify HTTPS works
- [ ] Test API connection (check browser console)
- [ ] Verify no CORS errors

## Step 11: Invalidate Cache (After Updates)
- [ ] Set: `export CLOUDFRONT_DIST_ID="YOUR_DIST_ID"`
- [ ] Run: `aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DIST_ID --paths "/*"`

## Step 12: Custom Domain (Optional)
- [ ] Request SSL certificate in ACM
- [ ] Validate certificate (DNS validation)
- [ ] Update CloudFront with CNAME
- [ ] Update DNS (Route 53 or your provider)
- [ ] Wait for DNS propagation

## Quick Commands Reference

```bash
# Set variables
export S3_BUCKET="panama-scraper-frontend"
export API_URL="https://api.yourdomain.com"
export CLOUDFRONT_DIST_ID="E1234567890ABC"

# Deploy
./scripts/deploy-frontend-s3.sh "$API_URL"

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DIST_ID --paths "/*"

# Check S3 files
aws s3 ls s3://$S3_BUCKET/

# Test S3 website
curl http://$S3_BUCKET.s3-website-us-east-1.amazonaws.com
```

## Troubleshooting

**Issue**: Files not updating
- **Fix**: Invalidate CloudFront cache

**Issue**: CORS errors
- **Fix**: Check S3 CORS config and API CORS headers

**Issue**: 403 Forbidden
- **Fix**: Update bucket policy for CloudFront OAC

**Issue**: API calls failing
- **Fix**: Check API URL in frontend, verify API is accessible

---

For detailed instructions, see `docs/S3_CLOUDFRONT_DEPLOYMENT.md`

