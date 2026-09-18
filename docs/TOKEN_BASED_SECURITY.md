# Token-Based Email Verification Security

## Overview

The subscription system now uses **secure token-based email verification**. Users receive an email with a unique access link that contains a token. This token is required to access their subscription data.

## How It Works

### 1. User Submits Subscription

**Endpoint:** `POST /subscribe/submit`

**Request:**
```json
{
  "email": "user@example.com",
  "tipo": "inmueble",
  "folio": "97213",
  "codigo": "8308"
}
```

**Response:**
```json
{
  "ok": true,
  "requestId": "1234567890-abc123",
  "status": "pending",
  "message": "Check your email for an access link to view your subscription status"
}
```

**What happens:**
1. Subscription is created with a unique `accessToken` (64-character hex string)
2. Email is sent to user with access link: `https://your-api.com/subscribe/request/1234567890-abc123?token=TOKEN_HERE`
3. User must click the link to access their subscription

### 2. User Clicks Email Link

**Link format:**
```
https://your-api.com/subscribe/request/1234567890-abc123?token=a1b2c3d4e5f6...
```

**What happens:**
1. Frontend extracts token from URL
2. Token is stored in sessionStorage
3. Frontend uses token to poll status and confirm subscription

### 3. Accessing Subscription Status

**Endpoint:** `GET /subscribe/request/:id?token=TOKEN`

**Security:**
- Token is required in query parameter
- Token is verified against stored token
- If token doesn't match → 404 (doesn't reveal if subscription exists)

**Example:**
```bash
curl "http://api.com/subscribe/request/1234567890-abc123?token=a1b2c3d4e5f6..."
```

### 4. Confirming Subscription

**Endpoint:** `POST /subscribe/request/:id/confirm`

**Request:**
```json
{
  "isCorrect": true,
  "runTime": "09:00",
  "token": "a1b2c3d4e5f6..."
}
```

**Security:**
- Token is required in request body
- Token is verified before allowing confirmation
- Only the token owner can confirm the subscription

## Security Benefits

✅ **No email enumeration** - Can't guess emails or IDs  
✅ **Secure access** - Only token holder can access subscription  
✅ **Email verification** - Proves user owns the email address  
✅ **No user accounts** - Simple token-based system  
✅ **Privacy protected** - Generic error messages prevent information leakage  

## Token Generation

**Method:** `crypto.randomBytes(32).toString('hex')`

**Properties:**
- 64 characters long
- Cryptographically secure random
- Unique per subscription
- Stored with subscription data

## Email Template

The email sent to users includes:

**Subject:** "Subscription Request Received - Access Your Status"

**Content:**
- Welcome message
- Clickable button/link with token
- Instructions on what they can do with the link
- Security notice

**Link format:**
```
${API_BASE_URL}/subscribe/request/${requestId}?token=${accessToken}
```

## Frontend Integration

### Handling Email Links

The frontend automatically:
1. Checks URL for `?token=...` parameter
2. Extracts token and request ID
3. Stores token in sessionStorage
4. Uses token for all API calls

### Code Example

```javascript
// Get token from URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
const requestId = urlParams.get('id');

// Store for session
if (token && requestId) {
  sessionStorage.setItem('subscription_token_' + requestId, token);
}

// Use token in API calls
const response = await fetch(`/subscribe/request/${requestId}?token=${token}`);
```

## Configuration

**Environment Variables:**

```bash
# Base URL for email links (required)
API_BASE_URL=https://your-api.com
# Or
FRONTEND_URL=https://your-frontend.com

# SMTP configuration (required for sending emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourdomain.com
```

## Testing

**Test email link:**
```bash
# 1. Create subscription
curl -X POST http://localhost:3000/subscribe/submit \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","tipo":"inmueble","folio":"97213","codigo":"8308"}'

# 2. Get token from storage (for testing)
# Check data/intro-requests.json for accessToken

# 3. Test access with token
curl "http://localhost:3000/subscribe/request/REQUEST_ID?token=TOKEN_FROM_STORAGE"
```

## Migration Notes

**Old system:** Required email query parameter  
**New system:** Requires token from email link

**Backward compatibility:** None - all users must use email links

## Security Best Practices

1. ✅ **Use HTTPS** - Tokens must be transmitted securely
2. ✅ **Set API_BASE_URL** - Ensure email links point to correct domain
3. ✅ **Monitor token usage** - Log access attempts
4. ✅ **Token expiration** - Consider adding expiration (future enhancement)
5. ✅ **Rate limiting** - Prevent token brute force attacks

## Troubleshooting

### "token_required" error
- User didn't use email link
- Token was removed from URL
- Solution: User must click link from email

### Email not received
- Check SMTP configuration
- Check spam folder
- Verify email address is correct

### Token doesn't work
- Token may have been regenerated
- Check token matches in storage
- Verify token wasn't modified in URL

## Summary

**Flow:**
1. User submits → Gets email with link
2. User clicks link → Token extracted from URL
3. Frontend uses token → Accesses subscription
4. User confirms → Token verified → Subscription activated

**Security:**
- ✅ Token-based access (no email guessing)
- ✅ Email verification (proves ownership)
- ✅ Privacy protected (generic errors)
- ✅ Admin endpoints protected (API key)

