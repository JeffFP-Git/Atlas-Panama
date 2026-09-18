#!/usr/bin/env node
// Debug script to check email configuration and test sending
// Usage: node lib/email-debug.js

import dotenv from 'dotenv';
import { sendEmail, testEmailConfig, sendFincaCompletionEmail } from './email.js';

dotenv.config();

(async () => {
  console.log('📧 Email Configuration Debug\n');
  console.log('='.repeat(50));
  
  // Check environment variables
  console.log('\n📋 Environment Variables:');
  console.log(`   FINCA_EMAIL_RECIPIENTS: ${process.env.FINCA_EMAIL_RECIPIENTS || '(not set)'}`);
  console.log(`   ALERT_EMAILS: ${process.env.ALERT_EMAILS || '(not set)'}`);
  console.log(`   SMTP_HOST: ${process.env.SMTP_HOST || '(not set)'}`);
  console.log(`   SMTP_PORT: ${process.env.SMTP_PORT || '587 (default)'}`);
  console.log(`   SMTP_USER: ${process.env.SMTP_USER || '(not set)'}`);
  console.log(`   SMTP_PASS: ${process.env.SMTP_PASS ? '***' + process.env.SMTP_PASS.slice(-4) : '(not set)'}`);
  console.log(`   SMTP_FROM: ${process.env.SMTP_FROM || process.env.SMTP_USER || '(not set)'}`);
  
  // Determine recipients
  const recipients = (process.env.FINCA_EMAIL_RECIPIENTS || process.env.ALERT_EMAILS || '')
    .split(/[;,]+/)
    .map(s => s.trim())
    .filter(Boolean);
  
  console.log(`\n📬 Recipients: ${recipients.length > 0 ? recipients.join(', ') : 'NONE (emails will be skipped)'}`);
  
  if (recipients.length === 0) {
    console.log('\n⚠️  No email recipients configured!');
    console.log('   Add to .env: FINCA_EMAIL_RECIPIENTS=your-email@example.com');
    process.exit(1);
  }
  
  // Test SMTP connection
  console.log('\n🔌 Testing SMTP Connection...');
  const smtpOk = await testEmailConfig();
  
  if (!smtpOk) {
    console.log('\n❌ SMTP test failed. Check your configuration.');
    process.exit(1);
  }
  
  // Send a test email
  console.log('\n📨 Sending test email...');
  const testResult = await sendEmail({
    to: recipients,
    subject: 'Test Email from Panama Scraper - ' + new Date().toLocaleString(),
    text: `This is a test email from the Panama Scraper email system.

If you receive this email, your configuration is working correctly.

Time: ${new Date().toISOString()}
Recipients: ${recipients.join(', ')}
SMTP Host: ${process.env.SMTP_HOST}

Check your inbox (and spam folder) for this message.`,
    html: `
      <h2>Test Email from Panama Scraper</h2>
      <p>This is a test email from the Panama Scraper email system.</p>
      <p>If you receive this email, your configuration is working correctly.</p>
      <hr>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      <p><strong>Recipients:</strong> ${recipients.join(', ')}</p>
      <p><strong>SMTP Host:</strong> ${process.env.SMTP_HOST}</p>
      <p><em>Check your inbox (and spam folder) for this message.</em></p>
    `
  });
  
  if (testResult) {
    console.log('\n✅ Test email sent!');
    console.log(`\n📬 Check your inbox at: ${recipients.join(', ')}`);
    console.log('   ⚠️  Also check your SPAM/JUNK folder if you don\'t see it');
    console.log('\n💡 If you still don\'t receive it:');
    console.log('   1. Check spam/junk folder');
    console.log('   2. Wait a few minutes (some providers delay emails)');
    console.log('   3. Verify the email address is correct');
    console.log('   4. Check SMTP provider logs/status');
  } else {
    console.log('\n❌ Failed to send test email');
    process.exit(1);
  }
  
  // Test finca completion email format
  console.log('\n📋 Testing Finca completion email format...');
  await sendFincaCompletionEmail({
    buildingName: 'TEST BUILDING',
    outputPath: '/test/path.xlsx',
    rowsExtracted: 10,
    hasChanges: true
  });
  
  console.log('\n✅ All email tests completed!');
})();

