# What Files to Upload to S3

Complete guide on what files need to be uploaded to S3 for your frontend to work with your API.

---

## Required Files

### All Files in `public/` Directory

The deployment script automatically uploads everything from the `public/` directory. Here's what you need:

#### 1. HTML Files (Required)

- **`subscribe.html`** - Main subscription form page
- **`intro.html`** - Intro pipeline interface (if using)
- **`index.html`** - Main dashboard (if using)
- **`simple.html`** - Simple interface (if using)

**At minimum, you need `subscribe.html`** - this is your main frontend.

#### 2. CSS (If Any)

- Any `.css` files in `public/` directory
- Inline styles in HTML are fine (no separate CSS needed)

#### 3. JavaScript (If Any)

- Any `.js` files in `public/` directory
- Most JavaScript is inline in HTML files (no separate JS needed)

#### 4. Images/Assets (Optional)

- Any images (`.png`, `.jpg`, `.svg`, etc.)
- Favicons (`.ico`)
- Any other static assets

---

## What Gets Uploaded Automatically

When you run the deployment script:

```bash
./scripts/deploy-frontend-s3.sh "https://api.yourdomain.com"
```

It automatically:
1. ✅ Copies all files from `public/` directory
2. ✅ Updates API URLs in HTML files
3. ✅ Uploads everything to S3
4. ✅ Sets correct permissions (public-read)

---

## File Structure

Your `public/` directory should look like this:

```
public/
├── subscribe.html      ← Main page (REQUIRED)
├── intro.html         ← Optional
├── index.html         ← Optional
├── simple.html        ← Optional
├── favicon.ico        ← Optional
└── any-other-assets/  ← Optional
```

---

## What the Frontend Needs to Connect to API

The frontend HTML files need to know your API URL. The deployment script automatically injects this.

### Before Deployment

Your HTML files have code like:
```javascript
const API_BASE = window.location.origin; // Uses same origin
// or
function getApiBase() {
  return location.origin;
}
```

### After Deployment

The script automatically adds:
```html
<script>window.API_BASE_URL = 'https://api.yourdomain.com';</script>
```

And your HTML uses it:
```javascript
const API_BASE = window.API_BASE_URL || window.location.origin;
```

---

## Manual Upload (If Not Using Script)

If you want to upload manually:

### Step 1: Prepare Files

```bash
# Create a temporary directory
mkdir -p /tmp/s3-upload
cp -r public/* /tmp/s3-upload/

# Update API URLs manually (if needed)
# Edit HTML files to set API_BASE_URL
```

### Step 2: Upload to S3

```bash
# Upload all files
aws s3 sync /tmp/s3-upload/ s3://panama-scraper-frontend/ \
  --acl public-read \
  --delete

# Or upload specific file
aws s3 cp public/subscribe.html s3://panama-scraper-frontend/subscribe.html \
  --acl public-read
```

---

## Minimum Required Files

**Absolute minimum for the site to work:**

1. **`subscribe.html`** - Your main frontend page

That's it! Everything else is optional.

---

## What Each File Does

### `subscribe.html`
- Main subscription form
- Connects to API endpoints:
  - `POST /subscribe/submit` - Submit subscription request
  - `GET /subscribe/request/:id` - Get request status
  - `POST /subscribe/request/:id/confirm` - Confirm property

### `intro.html` (Optional)
- Intro pipeline interface
- Connects to API endpoints:
  - `POST /intro/submit` - Submit intro request
  - `GET /intro/request/:id` - Get request status
  - `POST /intro/request/:id/confirm` - Confirm business

### `index.html` (Optional)
- Main dashboard
- Connects to API endpoints:
  - `POST /run` - Run scraper job
  - `GET /jobs/:id` - Get job status
  - `GET /health` - Health check

---

## Verification Checklist

After uploading, verify:

- [ ] `subscribe.html` is accessible
- [ ] Page loads without errors
- [ ] Browser console shows no 404s for missing files
- [ ] API calls work (check Network tab)
- [ ] Forms submit correctly
- [ ] No CORS errors

---

## Testing Your Upload

### 1. Check Files Are There

```bash
# List files in S3
aws s3 ls s3://panama-scraper-frontend/

# Should see:
# subscribe.html
# (and any other files you uploaded)
```

### 2. Test Website

Open in browser:
```
http://panama-scraper-frontend.s3-website-us-east-1.amazonaws.com
```

Or if using CloudFront:
```
https://your-cloudfront-url.cloudfront.net
```

### 3. Test API Connection

Open browser console and run:
```javascript
// Should return your API health status
fetch('https://api.yourdomain.com/health')
  .then(r => r.json())
  .then(console.log)
```

---

## Common Issues

### "404 Not Found" for HTML file

**Problem**: File not uploaded or wrong name

**Solution**:
```bash
# Check what's in S3
aws s3 ls s3://panama-scraper-frontend/

# Re-upload if missing
aws s3 cp public/subscribe.html s3://panama-scraper-frontend/subscribe.html --acl public-read
```

### API calls failing

**Problem**: API URL not set correctly

**Solution**:
1. Check browser console for API URL
2. Verify API URL in HTML (search for `API_BASE_URL`)
3. Re-deploy with correct API URL:
   ```bash
   ./scripts/deploy-frontend-s3.sh "https://api.yourdomain.com"
   ```

### CORS errors

**Problem**: S3 CORS not configured

**Solution**: See `docs/S3_WEBSITE_CONFIG.md` for CORS setup

---

## Quick Reference

**Upload everything from public/:**
```bash
./scripts/deploy-frontend-s3.sh "https://api.yourdomain.com"
```

**Upload manually:**
```bash
aws s3 sync public/ s3://panama-scraper-frontend/ --acl public-read
```

**Check what's uploaded:**
```bash
aws s3 ls s3://panama-scraper-frontend/
```

**Download from S3 (for verification):**
```bash
aws s3 cp s3://panama-scraper-frontend/subscribe.html ./downloaded.html
```

---

## Summary

**What to upload:**
- ✅ Everything in `public/` directory
- ✅ At minimum: `subscribe.html`

**How to upload:**
- ✅ Use deployment script (recommended): `./scripts/deploy-frontend-s3.sh`
- ✅ Or manually: `aws s3 sync public/ s3://bucket/ --acl public-read`

**What gets updated automatically:**
- ✅ API URLs in HTML files
- ✅ File permissions
- ✅ CloudFront cache invalidation (if configured)

---

For automatic deployment setup, see `docs/AUTO_DEPLOYMENT.md`
For S3 configuration, see `docs/S3_WEBSITE_CONFIG.md`

