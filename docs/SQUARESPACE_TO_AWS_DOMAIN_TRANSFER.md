# Transfer Domain from Squarespace to AWS Route 53

This guide walks you through transferring your domain registration from Squarespace to AWS Route 53. After transfer, you'll manage DNS directly in AWS.

---

## Important Notes Before Starting

⚠️ **Domain Transfer Requirements:**
- Domain must be at least 60 days old (ICANN rule)
- Domain must be unlocked
- Domain must not be expired or expiring soon
- You need the authorization/EPP code from Squarespace
- Transfer can take 5-7 days to complete
- Domain will be renewed for 1 year when transferred (you pay AWS)

💰 **Costs:**
- AWS Route 53 domain registration: ~$12-15/year (varies by TLD)
- You'll be charged when the transfer completes
- Squarespace may refund unused time (check their policy)

---

## Step 1: Prepare Domain in Squarespace

### 1.1 Unlock Your Domain

1. Log into your **Squarespace account**
2. Go to **Settings** → **Domains**
3. Click on the domain you want to transfer
4. Look for **Domain Lock** or **Transfer Lock** setting
5. **Disable/Unlock** the domain
   - This may be under "Advanced Settings" or "Security"
   - It might be called "Domain Lock", "Transfer Protection", or "Registrar Lock"

### 1.2 Get Authorization Code (EPP Code)

1. In the same domain settings page
2. Look for **Authorization Code**, **EPP Code**, or **Transfer Code**
3. Click **Get Authorization Code** or **Request Transfer Code**
4. Squarespace will email you the code (may take a few minutes)
5. **Save this code** - you'll need it in Step 3

**Note:** Some registrars call this:
- Authorization Code
- EPP Code
- Transfer Code
- Auth Code

### 1.3 Verify Contact Information

1. Ensure your **email address** is correct and accessible
2. You'll receive important emails during the transfer
3. Update contact info in Squarespace if needed:
   - Go to **Settings** → **Account & Security** → **Contact Information**

### 1.4 Disable Privacy Protection (If Enabled)

1. If you have **WHOIS Privacy** or **Domain Privacy** enabled:
   - Temporarily disable it (you can re-enable in AWS later)
   - This is required for the transfer to work

### 1.5 Note Your Current DNS Settings

**Before transferring, document your current DNS records:**

1. Go to **Settings** → **Domains** → Your Domain → **DNS Settings**
2. **Screenshot or write down** all DNS records:
   - A records
   - CNAME records
   - MX records (for email)
   - TXT records
   - Any other custom records

**Why?** You'll need to recreate these in Route 53 after transfer.

---

## Step 2: Set Up AWS Route 53

### 2.1 Create AWS Account (If Needed)

1. Go to https://aws.amazon.com/
2. Sign up or log in
3. Complete account verification if required

### 2.2 Access Route 53

1. Go to AWS Console: https://console.aws.amazon.com/
2. Search for **Route 53** in the services search bar
3. Click on **Route 53**

### 2.3 Verify Your AWS Account

Route 53 requires a verified account. If prompted:
1. Complete phone verification
2. Add payment method (you'll be charged when transfer completes)

---

## Step 3: Initiate Domain Transfer in Route 53

### 3.1 Start Transfer Request

1. In Route 53 console, click **Registered domains** (left sidebar)
2. Click **Transfer domain**
3. Enter your domain name (e.g., `yourdomain.com`)
4. Click **Check**

### 3.2 Enter Authorization Code

1. Paste the **Authorization Code** you got from Squarespace (Step 1.2)
2. Click **Continue**

### 3.3 Configure Domain Settings

You'll be asked to configure:

**Contact Information:**
- **Registrant Contact**: Your name, email, phone, address
- **Administrative Contact**: Usually same as registrant
- **Technical Contact**: Usually same as registrant

**Privacy Settings:**
- **Enable Domain Privacy**: Choose whether to hide your contact info (recommended: Yes)
- This costs extra (~$5/year)

**Auto-Renewal:**
- **Enable auto-renewal**: Recommended (Yes)
- Domain will automatically renew before expiration

**Name Servers:**
- For now, you can leave default Route 53 name servers
- You'll configure DNS records after transfer completes

### 3.4 Review and Confirm

1. Review all settings
2. Check the **transfer fee** (usually $12-15/year)
3. Click **Complete purchase** or **Submit transfer request**

**Note:** You'll be charged when the transfer completes (in 5-7 days), not immediately.

---

## Step 4: Approve Transfer

### 4.1 Check Your Email

1. **Squarespace will email you** asking to approve the transfer
2. Look for email from Squarespace (check spam folder)
3. Subject line might be: "Domain Transfer Request" or "Approve Domain Transfer"

### 4.2 Approve in Squarespace

1. Click the link in the email
2. Log into Squarespace if prompted
3. **Approve the transfer**
4. Or go to Squarespace → Settings → Domains → Your Domain → **Approve Transfer**

**Important:** If you don't approve within 5 days, the transfer will be cancelled.

### 4.3 Wait for Transfer to Complete

- Transfer typically takes **5-7 days**
- You'll receive email updates from AWS
- Check status in Route 53 → Registered domains → Your domain

**You can check status:**
1. Go to Route 53 → **Registered domains**
2. Click on your domain
3. Status will show: "Transfer in progress" → "Transfer complete"

---

## Step 5: Configure DNS in Route 53

Once transfer is complete, set up your DNS records.

### 5.1 Create Hosted Zone

1. In Route 53, go to **Hosted zones** (left sidebar)
2. Click **Create hosted zone**
3. **Domain name**: Enter your domain (e.g., `yourdomain.com`)
4. **Type**: Public hosted zone
5. Click **Create hosted zone**

Route 53 will automatically create:
- **NS records** (name servers)
- **SOA record** (start of authority)

### 5.2 Update Name Servers (If Needed)

If Route 53 didn't automatically set name servers:

1. In **Registered domains**, click your domain
2. Scroll to **Name servers**
3. Click **Edit**
4. Copy the 4 name servers from your **Hosted zone**
5. Paste them into the name server fields
6. Click **Update**

**To find your name servers:**
1. Go to **Hosted zones** → Your domain
2. Click on the hosted zone
3. Look for **NS** record type
4. Copy the 4 name server values (e.g., `ns-123.awsdns-12.com`)

### 5.3 Recreate DNS Records

Recreate the DNS records you documented in Step 1.5:

**For your Panama Scraper frontend (CloudFront):**

1. In your hosted zone, click **Create record**
2. **Record name**: `app` (for `app.yourdomain.com`) or leave blank (for root domain)
3. **Record type**: **CNAME**
4. **Value**: Your CloudFront distribution domain (e.g., `d1234567890abc.cloudfront.net`)
5. **TTL**: 300 (or default)
6. Click **Create records**

**For other records (A, MX, TXT, etc.):**

1. Click **Create record** for each record
2. Enter the details from your documentation
3. Common records:
   - **A record**: Points to IP addresses
   - **CNAME**: Points to other domains
   - **MX**: Email servers (if you use email on this domain)
   - **TXT**: SPF, DKIM, verification codes, etc.

### 5.4 Update CloudFront with Custom Domain

1. Go to **CloudFront** in AWS Console
2. Click on your distribution
3. Click **Edit**
4. **Alternate Domain Names (CNAMEs)**: Add `app.yourdomain.com` (or your domain)
5. **SSL Certificate**: Select your certificate (or request one in ACM)
6. Click **Save changes**

---

## Step 6: Update API CORS Settings

Update your API to allow the new domain:

### On Your EC2 Instance:

```bash
# SSH into EC2
ssh -i your-key.pem ec2-user@your-ec2-ip

# Navigate to project
cd ~/panama-scraper

# Edit .env
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

---

## Step 7: Verify Everything Works

### 7.1 Check DNS Propagation

Wait 24-48 hours for DNS to fully propagate, then check:

```bash
# Check name servers
dig NS yourdomain.com

# Check your subdomain
dig app.yourdomain.com

# Should return your CloudFront domain
```

Or use online tools:
- https://dnschecker.org
- https://www.whatsmydns.net

### 7.2 Test Your Domain

1. Visit `https://app.yourdomain.com`
2. Should load your frontend
3. Check browser console for errors
4. Test API connection

### 7.3 Test Email (If Applicable)

If you use email on this domain:
1. Send a test email
2. Verify MX records are correct
3. Check SPF/DKIM records if needed

---

## Troubleshooting

### Transfer Stuck or Failed

**Common issues:**
- **Domain locked**: Go back to Squarespace, unlock domain
- **Wrong auth code**: Request new code from Squarespace
- **Domain too new**: Must be 60+ days old
- **Expired domain**: Renew in Squarespace first
- **Privacy protection**: Disable in Squarespace

**Solution:**
1. Cancel transfer in Route 53
2. Fix the issue in Squarespace
3. Start new transfer request

### DNS Not Working After Transfer

**Check:**
1. **Name servers**: Ensure Route 53 name servers are set in registered domain
2. **DNS records**: Verify all records are recreated correctly
3. **Propagation**: Wait 24-48 hours for full propagation
4. **CloudFront**: Ensure distribution is deployed and custom domain configured

### Can't Access Domain

**If domain was working before transfer:**
1. Check DNS records match what you had in Squarespace
2. Verify CloudFront distribution is active
3. Check SSL certificate is valid
4. Clear browser cache

---

## Quick Reference Checklist

**Before Transfer:**
- [ ] Domain is 60+ days old
- [ ] Domain is unlocked in Squarespace
- [ ] Got authorization code from Squarespace
- [ ] Documented all DNS records
- [ ] Disabled privacy protection (temporarily)
- [ ] Verified email address is accessible

**During Transfer:**
- [ ] Initiated transfer in Route 53
- [ ] Entered authorization code
- [ ] Configured contact information
- [ ] Approved transfer email from Squarespace
- [ ] Waiting 5-7 days for completion

**After Transfer:**
- [ ] Created hosted zone in Route 53
- [ ] Updated name servers
- [ ] Recreated all DNS records
- [ ] Updated CloudFront with custom domain
- [ ] Updated API CORS settings
- [ ] Tested domain access
- [ ] Verified DNS propagation

---

## Alternative: Keep Domain in Squarespace, Use Route 53 for DNS Only

If you don't want to transfer the domain registration, you can:

1. **Keep domain registered in Squarespace**
2. **Use Route 53 only for DNS hosting:**
   - Create hosted zone in Route 53
   - Get Route 53 name servers
   - Update name servers in Squarespace DNS settings
   - Point to Route 53 name servers

This way you manage DNS in AWS but keep registration in Squarespace.

**Steps:**
1. Create hosted zone in Route 53 (Step 5.1)
2. Copy Route 53 name servers
3. In Squarespace → Settings → Domains → Your Domain → DNS Settings
4. Update name servers to Route 53 name servers
5. Create DNS records in Route 53 (not Squarespace)

---

## Next Steps

After domain transfer is complete:
- Set up CloudFront with your custom domain
- Configure SSL certificate in ACM
- Update API CORS settings
- Set up email (if needed) with SES or third-party service
- Enable domain privacy in Route 53
- Set up domain auto-renewal

---

## Support Resources

- **AWS Route 53 Documentation**: https://docs.aws.amazon.com/route53/
- **Squarespace Domain Help**: https://support.squarespace.com/hc/en-us/articles/205812378
- **ICANN Transfer Policy**: https://www.icann.org/resources/pages/transfer-policy-2016-06-01-en

