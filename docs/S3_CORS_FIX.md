# Fix: S3 CORS "Unsupported method is OPTIONS" Error

## The Problem

When configuring CORS in S3, you may see this error:
```
Found unsupported HTTP method in CORS config. Unsupported method is OPTIONS
```

## The Solution

**Remove `OPTIONS` from the AllowedMethods array.** S3 automatically handles OPTIONS requests for CORS preflight - you should NOT include it in your CORS configuration.

## Correct CORS Configuration

Use this configuration (notice NO `OPTIONS`):

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

## How to Fix

### If you're in AWS Console:

1. Go to S3 → Your bucket → **Permissions** tab
2. Scroll to **Cross-origin resource sharing (CORS)**
3. Click **Edit**
4. Replace the configuration with the one above (without OPTIONS)
5. Click **Save changes**

### If you're using AWS CLI:

```bash
# Create correct CORS config
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

# Apply it
aws s3api put-bucket-cors \
  --bucket YOUR_BUCKET_NAME \
  --cors-configuration file://cors.json
```

## Why This Happens

- S3 automatically handles OPTIONS requests for CORS preflight
- You don't need to (and shouldn't) include OPTIONS in AllowedMethods
- Including it causes the error you're seeing

## Verify It's Fixed

```bash
# Check current CORS config
aws s3api get-bucket-cors --bucket YOUR_BUCKET_NAME
```

You should see the configuration without OPTIONS, and the error should be gone.

