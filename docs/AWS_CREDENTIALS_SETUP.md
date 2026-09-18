# How to Get AWS Credentials

Step-by-step guide to get your AWS Access Key, Secret Key, and configure AWS CLI.

---

## Step 1: Sign In to AWS Console

1. Go to **https://aws.amazon.com/**
2. Click **Sign In to the Console** (top right)
3. Enter your AWS account email and password
4. If you don't have an account, click **Create a new AWS account** (free tier available)

---

## Step 2: Create an IAM User (Recommended)

**Why create a user?** It's a security best practice to use IAM users instead of your root account.

### 2.1 Go to IAM

1. In AWS Console, search for **IAM** in the top search bar
2. Click **IAM** (Identity and Access Management)

### 2.2 Create User

1. In the left sidebar, click **Users**
2. Click **Create user** button (top right)

### 2.3 Configure User

1. **User name**: Enter a name (e.g., `panama-scraper-deploy`)
2. **Provide user access to the AWS Management Console**: 
   - ✅ Check this box if you want console access
   - ❌ Uncheck if you only need programmatic access (CLI)
3. Click **Next**

### 2.4 Set Permissions

**Option A: Attach policies directly (Easier)**
1. Select **Attach policies directly**
2. Search for and select these policies:
   - ✅ **AmazonS3FullAccess** (for S3 bucket management)
   - ✅ **CloudFrontFullAccess** (for CloudFront distribution)
   - ✅ **IAMReadOnlyAccess** (optional, for viewing resources)
3. Click **Next**

**Option B: Add to group (Better for teams)**
1. Create a group with the policies above
2. Add user to group

### 2.5 Review and Create

1. Review your settings
2. Click **Create user**

---

## Step 3: Create Access Keys

### 3.1 Open User Details

1. Click on the user you just created
2. Click **Security credentials** tab

### 3.2 Create Access Key

1. Scroll to **Access keys** section
2. Click **Create access key** button

### 3.3 Choose Use Case

1. **Use case**: Select **Command Line Interface (CLI)**
2. Check the confirmation box
3. Click **Next**

### 3.4 Download Credentials

**⚠️ IMPORTANT: Download these now - you can't see the secret key again!**

1. Click **Download .csv file** button
   - This downloads a file with your Access Key ID and Secret Access Key
2. **OR** copy the values manually:
   - **Access Key ID**: Copy this value
   - **Secret Access Key**: Copy this value (click "Show" to reveal)

**Save these securely!** You'll need them for `aws configure`.

---

## Step 4: Configure AWS CLI

Now that you have your credentials, configure the CLI:

```bash
aws configure
```

You'll be prompted for 4 things:

### 4.1 AWS Access Key ID
```
AWS Access Key ID [None]: AKIAIOSFODNN7EXAMPLE
```
- Paste your **Access Key ID** from Step 3.4

### 4.2 AWS Secret Access Key
```
AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```
- Paste your **Secret Access Key** from Step 3.4

### 4.3 Default Region Name
```
Default region name [None]: us-east-1
```
- Enter: **`us-east-1`** (or your preferred region)
- Common regions:
  - `us-east-1` (N. Virginia) - Recommended, cheapest
  - `us-west-2` (Oregon)
  - `eu-west-1` (Ireland)
  - `ap-southeast-1` (Singapore)

### 4.4 Default Output Format
```
Default output format [None]: json
```
- Enter: **`json`** (recommended)
- Other options: `yaml`, `yaml-stream`, `text`, `table`

---

## Step 5: Verify Configuration

Test that your credentials work:

```bash
# Check your identity
aws sts get-caller-identity

# Should return something like:
# {
#     "UserId": "AIDAEXAMPLE",
#     "Account": "123456789012",
#     "Arn": "arn:aws:iam::123456789012:user/panama-scraper-deploy"
# }

# List S3 buckets (should work if permissions are correct)
aws s3 ls
```

If you see your account info, you're all set! ✅

---

## Alternative: Using AWS Console (No CLI)

If you prefer not to use CLI, you can do everything through the AWS Console:

1. **S3**: Create buckets, upload files via web interface
2. **CloudFront**: Create distributions via web interface
3. **Route 53**: Manage DNS via web interface

However, CLI is faster for repeated deployments.

---

## Security Best Practices

### ✅ DO:
- Use IAM users (not root account)
- Give users only the permissions they need
- Rotate access keys regularly (every 90 days)
- Use different users for different purposes
- Store credentials securely (password manager)

### ❌ DON'T:
- Share access keys
- Commit keys to git (they're in `.gitignore`)
- Use root account for daily operations
- Give more permissions than needed

---

## Troubleshooting

### "Access Denied" Errors

**Problem**: User doesn't have enough permissions

**Solution**: 
1. Go to IAM → Users → Your user
2. Add more policies:
   - `AmazonS3FullAccess`
   - `CloudFrontFullAccess`
   - `IAMReadOnlyAccess` (if needed)

### "Invalid credentials"

**Problem**: Wrong access key or secret key

**Solution**:
1. Verify you copied the keys correctly (no extra spaces)
2. Check if keys are still active (IAM → Users → Security credentials)
3. Create new access keys if needed

### "Region not found"

**Problem**: Invalid region name

**Solution**: Use valid region codes:
- `us-east-1` (N. Virginia)
- `us-west-2` (Oregon)
- `eu-west-1` (Ireland)
- etc.

### Can't find "Create access key" button

**Possible reasons**:
1. You're using the root account (not recommended)
2. You're viewing a different user
3. Your account has restrictions

**Solution**: Create an IAM user first (see Step 2)

---

## Quick Reference

**Where credentials are stored:**
- **macOS/Linux**: `~/.aws/credentials` and `~/.aws/config`
- **Windows**: `C:\Users\USERNAME\.aws\credentials`

**View current config:**
```bash
cat ~/.aws/credentials
cat ~/.aws/config
```

**Update credentials:**
```bash
aws configure
# Or edit files directly
nano ~/.aws/credentials
```

**Use different profile:**
```bash
aws configure --profile production
aws s3 ls --profile production
```

---

## Next Steps

Once you have credentials configured:

1. ✅ Test: `aws sts get-caller-identity`
2. ✅ Create S3 bucket: `aws s3 mb s3://panama-scraper-frontend`
3. ✅ Deploy frontend: `./scripts/deploy-frontend-s3.sh "https://api.yourdomain.com"`

See `docs/S3_CLOUDFRONT_DEPLOYMENT.md` for full deployment guide.

