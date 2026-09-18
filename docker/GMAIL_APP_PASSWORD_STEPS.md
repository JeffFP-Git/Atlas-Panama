# Gmail App Password - Step by Step

## Step 1: Enable 2-Step Verification

You must enable 2-Step Verification BEFORE App Passwords become available.

### Option A: Using Your Phone (Easiest)

1. Go to: https://myaccount.google.com/security
2. Under "Signing in to Google", find **2-Step Verification**
3. Click **Get started** or **Turn on**
4. Follow the prompts to:
   - Enter your password
   - Add your phone number
   - Verify with a code sent via SMS or phone call
5. Click **Turn on** to complete

### Option B: Using Authenticator App

1. Go to: https://myaccount.google.com/security
2. Click **2-Step Verification** → **Get started**
3. Choose **Authenticator app** instead of phone
4. Scan the QR code with Google Authenticator or similar app
5. Enter the code to verify
6. Click **Turn on**

## Step 2: Generate App Password

**After 2-Step Verification is enabled**, the App Passwords option will appear:

1. Go to: https://myaccount.google.com/security
2. Under "Signing in to Google", you should now see **App passwords** (it wasn't there before!)
3. Click **App passwords**
4. You may need to sign in again
5. Select:
   - **App:** Mail
   - **Device:** Other (Custom name)
   - **Name:** Panama Scraper
6. Click **Generate**
7. **Copy the 16-character password** (it looks like: `abcd efgh ijkl mnop`)
8. **Remove all spaces** when using it in your .env file

## Step 3: Update .env File

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcdefghijklmnop  # ← App Password (no spaces)
SMTP_FROM=your-email@gmail.com
```

## Troubleshooting

### "App passwords" option still not showing

**Possible reasons:**
1. **2-Step Verification not fully enabled** - Make sure you completed all steps
2. **Using a Workspace account** - Your admin may need to enable it
3. **Account too new** - Wait 24-48 hours after enabling 2FA
4. **Browser cache** - Try a different browser or incognito mode

### Alternative: Direct Link to App Passwords

After enabling 2-Step Verification, try this direct link:
https://myaccount.google.com/apppasswords

### Still Can't Get App Passwords?

If you absolutely cannot get App Passwords to work, consider:

1. **Use SendGrid** (easier, free tier):
   ```bash
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASS=your-sendgrid-api-key
   ```

2. **Use Outlook/Office 365** (if you have one):
   ```bash
   SMTP_HOST=smtp.office365.com
   SMTP_PORT=587
   SMTP_USER=your-email@outlook.com
   SMTP_PASS=your-password
   ```

3. **Use AWS SES** (if you have AWS account):
   ```bash
   SMTP_HOST=email-smtp.us-east-1.amazonaws.com
   SMTP_PORT=587
   SMTP_USER=your-ses-username
   SMTP_PASS=your-ses-password
   ```

## Quick Checklist

- [ ] 2-Step Verification enabled
- [ ] Phone number or Authenticator app added
- [ ] Can see "App passwords" option in Security settings
- [ ] Generated App Password (16 characters)
- [ ] Updated .env with App Password (no spaces)
- [ ] Tested with: `node lib/email-test.js`

