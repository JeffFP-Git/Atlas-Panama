# Gmail SMTP Setup Guide

Gmail requires **App Passwords** for SMTP authentication. Your regular Gmail password will NOT work.

## Step-by-Step Instructions

### 1. Enable 2-Factor Authentication

Gmail requires 2FA to generate App Passwords:

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Under "Signing in to Google", click **2-Step Verification**
3. Follow the prompts to enable 2FA (if not already enabled)

### 2. Generate an App Password

1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
   - Or: Google Account → Security → 2-Step Verification → App passwords
2. Select **Mail** as the app
3. Select **Other (Custom name)** as the device
4. Enter a name like "Panama Scraper"
5. Click **Generate**
6. **Copy the 16-character password** (it will look like: `abcd efgh ijkl mnop`)

### 3. Update Your .env File

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcdefghijklmnop  # Use the App Password (remove spaces)
SMTP_FROM=your-email@gmail.com
```

**Important:** 
- Use the **App Password**, not your regular Gmail password
- Remove any spaces from the App Password
- The App Password is 16 characters (no spaces)

### 4. Test the Configuration

```bash
node lib/email-test.js
```

## Troubleshooting

### "Username and Password not accepted" Error

**Cause:** Using regular Gmail password instead of App Password

**Fix:**
1. Make sure 2FA is enabled
2. Generate a new App Password
3. Use the App Password (not your regular password) in `.env`

### "Less secure app access" Error

**Cause:** Google has deprecated "Less secure app access"

**Fix:** You MUST use App Passwords. There's no way around this for Gmail.

### App Passwords Page Not Available

**Possible reasons:**
1. 2FA is not enabled (enable it first)
2. Using a Google Workspace account (admin may need to enable it)
3. Account is too new (wait 24-48 hours)

### Still Not Working?

1. **Double-check the App Password:**
   - Copy it directly from Google (don't type it manually)
   - Remove all spaces
   - Make sure it's exactly 16 characters

2. **Try port 465 with SSL:**
   ```bash
   SMTP_PORT=465
   SMTP_SECURE=1
   ```

3. **Check if account is locked:**
   - Go to [Account Security](https://myaccount.google.com/security)
   - Check for any security alerts

4. **Use a different email provider:**
   - SendGrid (free tier available)
   - AWS SES
   - Outlook/Office 365

## Alternative: Use SendGrid (Easier)

If Gmail is too complicated, SendGrid is often easier:

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=noreply@yourdomain.com
```

Get a free SendGrid account at: https://sendgrid.com

## Security Notes

- **Never commit App Passwords to git**
- **Rotate App Passwords** if you suspect they're compromised
- **Use dedicated service accounts** when possible
- **Revoke unused App Passwords** regularly

