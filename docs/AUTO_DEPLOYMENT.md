# Automatic Frontend Deployment Guide

Multiple ways to automatically deploy your frontend to S3 without manual uploads.

---

## Option 1: GitHub Actions (Recommended - Automatic on Git Push)

Deploy automatically whenever you push changes to your repository.

### Setup Steps

#### 1. Add GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these secrets:

   - **`AWS_ACCESS_KEY_ID`**: Your AWS access key
   - **`AWS_SECRET_ACCESS_KEY`**: Your AWS secret key
   - **`AWS_REGION`**: `us-east-1` (or your region)
   - **`S3_BUCKET`**: `panama-scraper-frontend` (your bucket name)
   - **`API_URL`**: `https://api.yourdomain.com` (your EC2 API URL)
   - **`CLOUDFRONT_DIST_ID`**: `E1234567890ABC` (optional, for cache invalidation)

#### 2. Push the Workflow File

The workflow file is already created at `.github/workflows/deploy-frontend.yml`. Just commit and push:

```bash
git add .github/workflows/deploy-frontend.yml
git commit -m "Add automatic frontend deployment"
git push
```

#### 3. It's Automatic!

Now, whenever you:
- Push changes to `public/` directory
- Push to `main` or `master` branch
- Manually trigger the workflow

GitHub Actions will automatically:
1. Checkout your code
2. Configure AWS credentials
3. Deploy to S3
4. Invalidate CloudFront cache (if configured)

### Manual Trigger

You can also trigger manually:
1. Go to **Actions** tab in GitHub
2. Select **Deploy Frontend to S3**
3. Click **Run workflow**

---

## Option 2: NPM Script (Quick Local Deploy)

Deploy from your local machine with a simple command.

### Setup

The script is already in `package.json`. Just set environment variables:

```bash
# Set your variables (add to ~/.bashrc or ~/.zshrc for persistence)
export S3_BUCKET="panama-scraper-frontend"
export API_URL="https://api.yourdomain.com"
export CLOUDFRONT_DIST_ID="E1234567890ABC"  # Optional
```

### Deploy

```bash
# Deploy with default API URL from env
npm run deploy:frontend

# Or specify API URL
npm run deploy:frontend "https://api.yourdomain.com"
```

---

## Option 3: Direct Script Usage

Use the deployment script directly.

### One-Time Setup

```bash
# Make script executable (if not already)
chmod +x scripts/deploy-frontend-s3.sh

# Set environment variables
export S3_BUCKET="panama-scraper-frontend"
export API_URL="https://api.yourdomain.com"
export CLOUDFRONT_DIST_ID="E1234567890ABC"  # Optional
```

### Deploy

```bash
# Deploy
./scripts/deploy-frontend-s3.sh "$API_URL"
```

---

## Option 4: Git Hooks (Deploy on Commit)

Deploy automatically when you commit changes locally.

### Setup Pre-Push Hook

```bash
# Create pre-push hook
cat > .git/hooks/pre-push << 'EOF'
#!/bin/bash
# Deploy frontend if public/ directory changed

if git diff-tree --name-only HEAD@{1} HEAD | grep -q "^public/"; then
  echo "🚀 Frontend files changed, deploying to S3..."
  
  export S3_BUCKET="${S3_BUCKET:-panama-scraper-frontend}"
  export API_URL="${API_URL:-https://api.yourdomain.com}"
  export CLOUDFRONT_DIST_ID="${CLOUDFRONT_DIST_ID:-}"
  
  ./scripts/deploy-frontend-s3.sh "$API_URL"
  
  if [ $? -eq 0 ]; then
    echo "✅ Frontend deployed successfully!"
  else
    echo "❌ Deployment failed!"
    exit 1
  fi
fi
EOF

chmod +x .git/hooks/pre-push
```

Now, when you push and `public/` files changed, it will automatically deploy.

---

## Option 5: Watch Mode (Auto-Deploy on File Changes)

Automatically deploy when you save files locally.

### Install Watch Tool

```bash
# Install fswatch (macOS)
brew install fswatch

# Or use entr (Linux/macOS)
brew install entr  # macOS
# sudo apt install entr  # Linux
```

### Create Watch Script

```bash
cat > scripts/watch-and-deploy.sh << 'EOF'
#!/bin/bash
set -e

export S3_BUCKET="${S3_BUCKET:-panama-scraper-frontend}"
export API_URL="${API_URL:-https://api.yourdomain.com}"
export CLOUDFRONT_DIST_ID="${CLOUDFRONT_DIST_ID:-}"

echo "👀 Watching public/ directory for changes..."
echo "   S3 Bucket: $S3_BUCKET"
echo "   API URL: $API_URL"
echo "   Press Ctrl+C to stop"
echo ""

# Watch for changes and deploy
fswatch -o public/ | while read f; do
  echo "📝 Files changed, deploying..."
  ./scripts/deploy-frontend-s3.sh "$API_URL"
  echo "✅ Deployed! Waiting for next change..."
done
EOF

chmod +x scripts/watch-and-deploy.sh
```

### Use It

```bash
# Start watching
./scripts/watch-and-deploy.sh

# Now, whenever you save a file in public/, it auto-deploys!
```

---

## Option 6: VS Code Task (One-Click Deploy)

Deploy with a keyboard shortcut in VS Code.

### Create VS Code Task

Create `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Deploy Frontend to S3",
      "type": "shell",
      "command": "./scripts/deploy-frontend-s3.sh",
      "args": ["${env:API_URL}"],
      "options": {
        "env": {
          "S3_BUCKET": "${env:S3_BUCKET}",
          "CLOUDFRONT_DIST_ID": "${env:CLOUDFRONT_DIST_ID}"
        }
      },
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    }
  ]
}
```

### Use It

1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Tasks: Run Task"
3. Select "Deploy Frontend to S3"

Or set up a keyboard shortcut in VS Code settings.

---

## Comparison

| Method | When It Deploys | Best For |
|--------|----------------|----------|
| **GitHub Actions** | On git push | Production, team collaboration |
| **NPM Script** | Manual command | Quick local deployments |
| **Git Hooks** | On git push (local) | Personal projects |
| **Watch Mode** | On file save | Development, rapid iteration |
| **VS Code Task** | Manual trigger | VS Code users |

---

## Recommended Setup

**For Production:**
- Use **GitHub Actions** (Option 1) - automatic, reliable, tracks deployments

**For Development:**
- Use **Watch Mode** (Option 5) - see changes instantly

**For Quick Deploys:**
- Use **NPM Script** (Option 2) - simple one command

---

## Environment Variables Reference

Create a `.env.deploy` file (don't commit it):

```bash
# .env.deploy
S3_BUCKET=panama-scraper-frontend
API_URL=https://api.yourdomain.com
CLOUDFRONT_DIST_ID=E1234567890ABC
AWS_REGION=us-east-1
```

Load it before deploying:

```bash
source .env.deploy
npm run deploy:frontend
```

---

## Troubleshooting

### "Permission denied" on script

```bash
chmod +x scripts/deploy-frontend-s3.sh
```

### "AWS credentials not found"

```bash
# Configure AWS CLI
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
```

### GitHub Actions failing

1. Check secrets are set correctly
2. Verify AWS credentials have S3 and CloudFront permissions
3. Check Actions logs for specific errors

### Files not updating in CloudFront

```bash
# Manually invalidate cache
aws cloudfront create-invalidation \
  --distribution-id $CLOUDFRONT_DIST_ID \
  --paths "/*"
```

---

## Quick Start

**Fastest setup (GitHub Actions):**

1. Add secrets to GitHub (see Option 1)
2. Push code - it deploys automatically!

**Fastest local deploy:**

```bash
export S3_BUCKET="panama-scraper-frontend"
export API_URL="https://api.yourdomain.com"
npm run deploy:frontend
```

---

For detailed S3/CloudFront setup, see `docs/S3_CLOUDFRONT_DEPLOYMENT.md`

