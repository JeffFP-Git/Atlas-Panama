#!/bin/bash
# Deploy frontend to S3 + CloudFront
# Usage: ./scripts/deploy-frontend-s3.sh [API_URL]
#
# Environment variables:
#   S3_BUCKET - S3 bucket name (default: panama-scraper-frontend)
#   CLOUDFRONT_DIST_ID - CloudFront distribution ID (optional, for cache invalidation)
#
# Example:
#   export S3_BUCKET="my-bucket"
#   export CLOUDFRONT_DIST_ID="E1234567890ABC"
#   ./scripts/deploy-frontend-s3.sh "https://api.yourdomain.com"

set -e

API_URL="${1:-https://api.yourdomain.com}"
BUCKET_NAME="${S3_BUCKET:-panama-scraper-frontend}"
CLOUDFRONT_DIST_ID="${CLOUDFRONT_DIST_ID:-}"

echo "🚀 Deploying frontend to S3..."
echo "   API URL: $API_URL"
echo "   S3 Bucket: $BUCKET_NAME"

# Create temp directory
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

# Copy public files (includes subscribe.html, verify.html, and any other static assets)
cp -r public/* "$TMP_DIR/"

# Update API URLs in HTML files (subscribe.html, verify.html, etc.)
for html_file in "$TMP_DIR"/*.html; do
  if [ -f "$html_file" ]; then
    echo "   Updating API URL in $(basename $html_file)..."
    # Inject API_BASE_URL before closing </head>
    sed -i.bak "s|</head>|<script>window.API_BASE_URL = '$API_URL';</script></head>|g" "$html_file"
    rm -f "$html_file.bak"
  fi
done

# Upload to S3
echo "   Uploading to S3..."
# Note: Using bucket policy for public access (ACLs disabled by default in new buckets)
aws s3 sync "$TMP_DIR/" "s3://$BUCKET_NAME/" \
  --exclude "*.git*" \
  --delete

# Invalidate CloudFront cache if distribution ID is provided
if [ -n "$CLOUDFRONT_DIST_ID" ]; then
  echo "   Invalidating CloudFront cache..."
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DIST_ID" \
    --paths "/*" \
    --query 'Invalidation.{Id:Id,Status:Status}' \
    --output table
fi

echo "✅ Frontend deployed successfully!"

# Get bucket region
BUCKET_REGION=$(aws s3api get-bucket-location --bucket "$BUCKET_NAME" --query 'LocationConstraint' --output text 2>/dev/null || echo "us-east-1")
# us-east-1 returns null, so handle that
if [ "$BUCKET_REGION" = "None" ] || [ -z "$BUCKET_REGION" ]; then
  BUCKET_REGION="us-east-1"
fi

echo "   Access at: https://$BUCKET_NAME.s3-website-$BUCKET_REGION.amazonaws.com"
if [ -n "$CLOUDFRONT_DIST_ID" ]; then
  echo "   Or via CloudFront: https://$(aws cloudfront get-distribution --id $CLOUDFRONT_DIST_ID --query 'Distribution.DomainName' --output text)"
fi

