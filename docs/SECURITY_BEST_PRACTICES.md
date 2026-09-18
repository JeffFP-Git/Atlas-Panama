# Security Best Practices for Subscription API

## Current Security Issues

**Critical vulnerabilities:**

1. **Information Disclosure** - Anyone can access `/subscribe/request/:id` with any ID and see:
   - Other users' email addresses
   - Other users' subscription details
   - Personal information

2. **Enumeration Attack** - IDs are predictable (timestamp-based), making it easy to guess other users' IDs

3. **Unauthorized Access** - No verification that a user owns the subscription they're accessing

4. **Mass Data Exposure** - `/subscribe/requests` exposes all subscriptions and emails

## Recommended Security Model

### Option 1: Email-Based Verification (Recommended)

**How it works:**
- When user submits subscription, send them a unique token via email
- User must provide token to access their subscription
- Token acts as proof of ownership

**Implementation:**
```
POST /subscribe/submit
→ Returns: { requestId, accessToken }
→ Sends email with token

GET /subscribe/request/:id?token=ACCESS_TOKEN
→ Verifies token matches subscription
→ Returns subscription data only if token matches
```

**Pros:**
- ✅ Simple to implement
- ✅ No user accounts needed
- ✅ Email verification built-in
- ✅ Users can only access their own data

**Cons:**
- ⚠️ Token must be stored securely
- ⚠️ Email delivery must be reliable

### Option 2: Email Query Parameter

**How it works:**
- User provides email when accessing subscription
- System verifies email matches subscription
- Only returns data if email matches

**Implementation:**
```
GET /subscribe/request/:id?email=user@example.com
→ Verifies email matches subscription
→ Returns data only if email matches
```

**Pros:**
- ✅ Very simple
- ✅ No tokens to manage

**Cons:**
- ⚠️ Email addresses can be guessed/enumerated
- ⚠️ Less secure than tokens

### Option 3: Admin API Key + Public User Endpoints

**How it works:**
- Public endpoints require email verification
- Admin endpoints require API key
- Users can only access their own data

**Implementation:**
```
Public (email verification):
- GET /subscribe/request/:id?email=user@example.com
- POST /subscribe/request/:id/confirm?email=user@example.com

Protected (API key required):
- GET /subscribe/requests (list all - admin only)
- DELETE /subscribe/request/:id (admin only)
```

## Recommended Implementation

### Security Layers

1. **Public Endpoints (Email Verification)**
   - `/subscribe/submit` - Submit subscription (public)
   - `/subscribe/request/:id` - Get own subscription (requires email match)
   - `/subscribe/request/:id/confirm` - Confirm own subscription (requires email match)

2. **Admin Endpoints (API Key Required)**
   - `/subscribe/requests` - List all subscriptions
   - `/scheduler/*` - All scheduler operations
   - `/run` - Manual job runs
   - `/jobs/*` - Job management
   - `/files/*` - File downloads

3. **Public Intro Endpoints**
   - `/intro/*` - All intro pipeline endpoints (public)

### Implementation Steps

1. Add email verification to `/subscribe/request/:id`
2. Add email verification to `/subscribe/request/:id/confirm`
3. Protect `/subscribe/requests` with API key
4. Add rate limiting to prevent enumeration
5. Sanitize error messages (don't reveal if subscription exists)

## Example Secure Implementation

```javascript
// Get subscription - requires email verification
app.get('/subscribe/request/:id', (req, res) => {
  const { id } = req.params;
  const { email } = req.query; // or req.body for POST
  
  if (!email) {
    return res.status(400).json({ 
      ok: false, 
      error: 'email_required' 
    });
  }
  
  const request = storage.getSubscriptionRequest(id);
  
  if (!request) {
    // Don't reveal if subscription exists (prevent enumeration)
    return res.status(404).json({ 
      ok: false, 
      error: 'not_found' 
    });
  }
  
  // Verify email matches
  if (request.email.toLowerCase() !== email.toLowerCase()) {
    return res.status(403).json({ 
      ok: false, 
      error: 'unauthorized' 
    });
  }
  
  // Return subscription data
  return res.json({ ok: true, request });
});
```

## Additional Security Measures

1. **Rate Limiting**
   - Limit requests per IP
   - Prevent brute force enumeration

2. **Input Validation**
   - Validate email format
   - Sanitize all inputs
   - Prevent injection attacks

3. **Error Messages**
   - Don't reveal if subscription exists
   - Generic error messages
   - Log security events

4. **Audit Logging**
   - Log all access attempts
   - Monitor for suspicious patterns
   - Alert on multiple failed attempts

5. **HTTPS Only**
   - Require HTTPS in production
   - Prevent man-in-the-middle attacks
   - Protect email addresses in transit

## Summary

**Current State:** ❌ Insecure - Anyone can access anyone's data

**Recommended:** ✅ Email verification + Admin API key

**Best Practice:**
- Users can only access their own subscriptions (email verification)
- Admins can list/manage all subscriptions (API key)
- Public endpoints for submission only
- Rate limiting and audit logging

