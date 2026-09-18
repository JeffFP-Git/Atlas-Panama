# Email Configuration for Finca Pipeline

The finca pipeline can send email notifications on completion, errors, and when changes are detected. This works on Windows, Linux, EC2, and in Docker containers.

## Quick Setup

### 1. Add to `.env` file

```bash
# Email Recipients (comma or semicolon separated)
FINCA_EMAIL_RECIPIENTS=your-email@example.com,another@example.com
# OR use ALERT_EMAILS (shared with other scrapers)
ALERT_EMAILS=your-email@example.com

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

### 2. Test Email Configuration

```bash
node -e "import('./lib/email.js').then(m => m.testEmailConfig())"
```

## Email Provider Examples

### Gmail

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Use App Password, not regular password
SMTP_FROM=your-email@gmail.com
```

**Note:** For Gmail, you need to:
1. Enable 2-Factor Authentication
2. Generate an [App Password](https://support.google.com/accounts/answer/185833)
3. Use the App Password as `SMTP_PASS`

### SendGrid

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=noreply@yourdomain.com
```

### AWS SES

```bash
SMTP_HOST=email-smtp.us-east-1.amazonaws.com  # Use your region
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=your-ses-smtp-username
SMTP_PASS=your-ses-smtp-password
SMTP_FROM=noreply@yourdomain.com
```

### Outlook/Office 365

```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
SMTP_FROM=your-email@outlook.com
```

### Custom SMTP Server

```bash
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=0  # Use 1 for port 465 (SSL)
SMTP_USER=your-username
SMTP_PASS=your-password
SMTP_FROM=noreply@yourdomain.com
```

## What Emails Are Sent

### 1. Success Email (No Changes)
- **Subject:** `✅ Finca Scraper Completed: [Building Name]`
- **Content:** Summary of rows extracted, output file location
- **Attachments:** None

### 2. Success Email (Changes Detected)
- **Subject:** `📊 Finca Scraper: Changes Detected for [Building Name]`
- **Content:** Summary with warning about changes
- **Attachments:** Excel file with changes

### 3. Error Email
- **Subject:** `❌ Finca Scraper Failed: [Building Name]`
- **Content:** Error message and details
- **Attachments:** None

## Docker Configuration

Email works automatically in Docker containers. Just mount your `.env` file:

```yaml
# docker-compose.yml
services:
  finca:
    volumes:
      - ./.env:/app/.env:ro
    environment:
      - FINCA_EMAIL_RECIPIENTS=${FINCA_EMAIL_RECIPIENTS}
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
      - SMTP_FROM=${SMTP_FROM}
```

## Systemd Service Configuration

For EC2 systemd services, the `.env` file is automatically loaded:

```bash
# The service file already includes:
EnvironmentFile=/home/ubuntu/panama-scraper/.env
```

Just make sure your `.env` has the email configuration.

## Troubleshooting

### Email Not Sending

1. **Check configuration:**
   ```bash
   node -e "import('./lib/email.js').then(m => m.testEmailConfig())"
   ```

2. **Check logs:**
   ```bash
   tail -f logs/systemd-finca.log
   ```

3. **Common issues:**
   - **Gmail:** Need App Password, not regular password
   - **Port blocked:** Try port 465 with `SMTP_SECURE=1`
   - **Firewall:** Ensure SMTP port is open (587 or 465)
   - **Docker:** Check if container can reach SMTP server

### Test SMTP Connection

```bash
# Test with telnet (if available)
telnet smtp.gmail.com 587

# Or use openssl
openssl s_client -connect smtp.gmail.com:587 -starttls smtp
```

### Disable Email

To disable email notifications, simply don't set `FINCA_EMAIL_RECIPIENTS` or `ALERT_EMAILS`. The scraper will continue to work normally, just without email notifications.

## Security Notes

1. **Never commit `.env` file** - It contains sensitive credentials
2. **Use App Passwords** for Gmail/Google accounts
3. **Use environment variables** in production instead of `.env` file
4. **Rotate passwords** regularly
5. **Use least-privilege** email accounts (dedicated service account)

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FINCA_EMAIL_RECIPIENTS` | No | - | Comma/semicolon separated email addresses |
| `ALERT_EMAILS` | No | - | Alternative (shared with other scrapers) |
| `SMTP_HOST` | Yes* | - | SMTP server hostname |
| `SMTP_PORT` | No | 587 | SMTP server port |
| `SMTP_SECURE` | No | 0 | Use SSL/TLS (1 for port 465) |
| `SMTP_USER` | Yes* | - | SMTP username |
| `SMTP_PASS` | Yes* | - | SMTP password |
| `SMTP_FROM` | No | SMTP_USER | From email address |
| `SMTP_REJECT_UNAUTHORIZED` | No | 1 | Reject unauthorized certificates |

*Required only if email is enabled

