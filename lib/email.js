// Email notification module for Panama Scraper
// Works with SMTP providers (Gmail, SendGrid, AWS SES, etc.)
// Compatible with Docker, Windows, Linux, and EC2

import nodemailer from 'nodemailer';

let transporter = null;

/**
 * Initialize email transporter from environment variables
 */
function getTransporter() {
  if (transporter) return transporter;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const smtpSecure = process.env.SMTP_SECURE === '1' || process.env.SMTP_SECURE === 'true';
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  // If no SMTP configured, return null (emails will be logged instead)
  if (!smtpHost || !smtpUser || !smtpPass) {
    return null;
  }

  // Warn if using Gmail with what looks like a regular password (too short)
  if (smtpHost && smtpHost.includes('gmail.com') && smtpPass && smtpPass.length < 16) {
    console.warn('⚠️  Gmail requires App Passwords (16+ characters), not regular passwords!');
    console.warn('   Get one at: https://myaccount.google.com/apppasswords');
  }
  
  // Suggest port 465 for Gmail if using 587 and having connection issues
  if (smtpHost && smtpHost.includes('gmail.com') && smtpPort === 587) {
    console.log('ℹ️  Using Gmail with port 587 (TLS). If you experience connection timeouts,');
    console.log('   try port 465 (SSL) instead: SMTP_PORT=465 SMTP_SECURE=1');
  }

  // Gmail-specific configuration
  const isGmail = smtpHost && smtpHost.includes('gmail.com');
  const useSecure = smtpSecure || (isGmail && smtpPort === 465);
  
  // VPN/Proxy support - Check for proxy configuration
  const proxyUrl = process.env.SMTP_PROXY || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  
  // Build transport options with increased timeouts for VPN connections
  const transportOptions = {
    host: smtpHost,
    port: smtpPort,
    secure: useSecure, // true for 465, false for other ports
    auth: {
      user: smtpUser,
      pass: smtpPass
    },
    // Common options for various providers
    tls: {
      rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== '0',
      // Gmail-specific TLS options
      ciphers: isGmail ? 'SSLv3' : undefined
    },
    // Connection timeouts - increased for VPN connections
    connectionTimeout: parseInt(process.env.SMTP_CONNECTION_TIMEOUT || '30000', 10), // 30 seconds (increased for VPN)
    greetingTimeout: parseInt(process.env.SMTP_GREETING_TIMEOUT || '15000', 10), // 15 seconds
    socketTimeout: parseInt(process.env.SMTP_SOCKET_TIMEOUT || '90000', 10), // 90 seconds (increased for VPN)
    // Retry configuration
    pool: isGmail, // Use connection pooling for Gmail
    maxConnections: 1,
    maxMessages: 3,
    // Add debug logging if enabled
    debug: process.env.SMTP_DEBUG === '1',
    logger: process.env.SMTP_DEBUG === '1' ? console.log : false
  };
  
  // Note: For VPN issues, try these solutions:
  // 1. Use port 465 with SSL: SMTP_PORT=465 SMTP_SECURE=1
  // 2. Increase timeouts (already done above)
  // 3. Use a VPN-friendly email service (SendGrid, Mailgun, etc.)
  // 4. Configure SOCKS proxy if your VPN supports it
  
  if (proxyUrl) {
    console.log(`🔗 Proxy detected: ${proxyUrl}`);
    console.log('   Note: nodemailer doesn\'t natively support HTTP proxies.');
    console.log('   For VPN issues, try: SMTP_PORT=465 SMTP_SECURE=1 (uses SSL instead of TLS)');
  }
  
  transporter = nodemailer.createTransport(transportOptions);

  return transporter;
}

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @param {string} [options.html] - HTML body (optional)
 * @param {string[]} [options.attachments] - Array of file paths to attach
 * @returns {Promise<boolean>} - True if sent successfully, false otherwise
 */
export async function sendEmail({ to, subject, text, html, attachments = [] }) {
  const recipients = Array.isArray(to) ? to : [to].filter(Boolean);
  
  if (recipients.length === 0) {
    console.log('ℹ️  No email recipients specified; skipping email.');
    return false;
  }

  const transporter = getTransporter();
  const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!transporter) {
    console.log('ℹ️  SMTP not configured; email would be sent:');
    console.log(`   To: ${recipients.join(', ')}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body: ${text.substring(0, 200)}...`);
    return false;
  }

  try {
    console.log('  📎 Preparing attachments...');
    // Prepare attachments
    const fs = await import('fs');
    const attachmentFiles = attachments.map(filePath => {
      try {
        const stats = fs.statSync(filePath);
        console.log(`     ✓ Found attachment: ${filePath} (${(stats.size / 1024).toFixed(2)} KB)`);
        return { path: filePath };
      } catch (err) {
        console.error(`     ⚠️  Attachment not found: ${filePath}`);
        return null;
      }
    }).filter(Boolean);

    console.log(`  📝 Preparing email message...`);
    const mailOptions = {
      from: smtpFrom,
      to: recipients.join(', '),
      subject,
      text,
      html: html || text.replace(/\n/g, '<br>'),
      attachments: attachmentFiles.length > 0 ? attachmentFiles : undefined
    };

    console.log(`  🔌 Connecting to SMTP server (${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587})...`);
    const startTime = Date.now();
    
    // Wrap sendMail in a timeout promise
    const emailTimeout = parseInt(process.env.SMTP_TIMEOUT || '60000', 10); // Default 60 seconds
    const sendPromise = transporter.sendMail(mailOptions);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Email sending timed out after ${emailTimeout}ms`));
      }, emailTimeout);
    });

    console.log(`  ⏳ Sending email (timeout: ${emailTimeout}ms)...`);
    const info = await Promise.race([sendPromise, timeoutPromise]);
    
    const elapsed = Date.now() - startTime;
    console.log(`✅ Email sent successfully to ${recipients.join(', ')} (took ${elapsed}ms)`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   From: ${mailOptions.from}`);
    console.log(`   Subject: ${mailOptions.subject}`);
    if (info.response) {
      console.log(`   Server response: ${info.response}`);
    }
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email: ${error.message}`);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    if (error.response) {
      console.error(`   Server response: ${error.response}`);
    }
    if (error.responseCode) {
      console.error(`   Response code: ${error.responseCode}`);
    }
    if (error.command) {
      console.error(`   Failed command: ${error.command}`);
    }
    // Provide helpful hints for common errors
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT') || error.message.includes('ECONNRESET')) {
      console.error('\n💡 Email sending timed out. Possible causes:');
      console.error('   - Network connectivity issues');
      console.error('   - SMTP server is down or unreachable');
      console.error('   - Firewall blocking SMTP port');
      console.error('   - SMTP server rate limiting');
      console.error('\n   Try:');
      console.error('   - Check your internet connection');
      console.error('   - Verify SMTP_HOST and SMTP_PORT are correct');
      console.error('   - Increase SMTP_TIMEOUT (default: 60000ms) if needed');
      console.error('   - Test with: SMTP_DEBUG=1 node -e "import(\'./lib/email.js\').then(m => m.testEmailConfig())"');
    } else if (error.message.includes('BadCredentials') || error.message.includes('Invalid login') || error.message.includes('535')) {
      if (process.env.SMTP_HOST && process.env.SMTP_HOST.includes('gmail.com')) {
        console.error('\n💡 Gmail requires an App Password, not your regular password!');
        console.error('   1. Go to: https://myaccount.google.com/apppasswords');
        console.error('   2. Generate an App Password for "Mail"');
        console.error('   3. Use that App Password as SMTP_PASS in your .env file');
        console.error('   4. Make sure 2-Factor Authentication is enabled on your Google account');
      } else {
        console.error('\n💡 Check your SMTP credentials:');
        console.error('   - Verify SMTP_USER and SMTP_PASS are correct');
        console.error('   - Some providers require App Passwords instead of regular passwords');
      }
    }
    return false;
  }
}

/**
 * Send email notification for finca pipeline completion
 * @param {Object} options
 * @param {string} options.buildingName - Building/company name
 * @param {string} options.outputPath - Path to output Excel file
 * @param {string} [options.changesPath] - Path to changes Excel file
 * @param {number} options.rowsExtracted - Number of rows extracted
 * @param {boolean} options.hasChanges - Whether changes were detected
 * @param {string} [options.error] - Error message if failed
 */
export async function sendFincaCompletionEmail({ buildingName, outputPath, changesPath, rowsExtracted, hasChanges, error, subscriptionId, accessToken, recipientEmail }) {
  // Use recipientEmail if provided (for subscriptions), otherwise use env vars
  let recipients;
  if (recipientEmail) {
    recipients = [recipientEmail];
  } else {
    recipients = (process.env.FINCA_EMAIL_RECIPIENTS || process.env.ALERT_EMAILS || '')
    .split(/[;,]+/)
    .map(s => s.trim())
    .filter(Boolean);
  }

  if (recipients.length === 0) {
    console.log('ℹ️  No email recipients configured; skipping email notification.');
    if (!recipientEmail) {
    console.log('   Set FINCA_EMAIL_RECIPIENTS or ALERT_EMAILS in .env to enable emails');
    }
    return false;
  }

  // Check if SMTP is configured before attempting to send
  const transporter = getTransporter();
  if (!transporter) {
    console.log('ℹ️  SMTP not configured; email would be sent:');
    console.log(`   To: ${recipients.join(', ')}`);
    console.log('   Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env to send emails');
    return false;
  }

  console.log(`📧 Preparing email notification to: ${recipients.join(', ')}`);

  const subject = error
    ? `❌ Finca Scraper Failed: ${buildingName}`
    : hasChanges
    ? `📊 Finca Scraper: Changes Detected for ${buildingName}`
    : `✅ Finca Scraper Completed: ${buildingName}`;

  let text = '';
  let html = '';

  if (error) {
    text = `Finca Scraper Error\n\n`;
    text += `Building/Company: ${buildingName}\n`;
    text += `Error: ${error}\n`;
    text += `Time: ${new Date().toLocaleString()}\n`;

    html = `
      <h2>Finca Scraper Error</h2>
      <p><strong>Building/Company:</strong> ${buildingName}</p>
      <p><strong>Error:</strong> <code>${error}</code></p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    `;
  } else {
    text = `Finca Scraper Results\n\n`;
    text += `Building/Company: ${buildingName}\n`;
    text += `Rows Extracted: ${rowsExtracted}\n`;
    text += `Changes Detected: ${hasChanges ? 'Yes' : 'No'}\n`;
    text += `Output File: ${outputPath}\n`;
    if (changesPath && hasChanges) {
      text += `Changes File: ${changesPath}\n`;
    }
    text += `Time: ${new Date().toLocaleString()}\n`;

    html = `
      <h2>Finca Scraper Results</h2>
      <p><strong>Building/Company:</strong> ${buildingName}</p>
      <p><strong>Rows Extracted:</strong> ${rowsExtracted}</p>
      <p><strong>Changes Detected:</strong> ${hasChanges ? '<span style="color: red;">Yes</span>' : '<span style="color: green;">No</span>'}</p>
      <p><strong>Output File:</strong> <code>${outputPath}</code></p>
      ${changesPath && hasChanges ? `<p><strong>Changes File:</strong> <code>${changesPath}</code></p>` : ''}
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    `;

    if (hasChanges) {
      text += `\n⚠️  Changes were detected. Please review the changes file.\n`;
      html += `<p style="color: red; font-weight: bold;">⚠️  Changes were detected. Please review the changes file.</p>`;
    }
  }

  const attachments = [];
  // Always attach main output file if it exists (even when no changes)
  if (!error && outputPath) {
    try {
      const fs = await import('fs');
      if (fs.existsSync(outputPath)) {
        attachments.push(outputPath);
      }
    } catch {}
  }
  // Also attach changes file if changes were detected
  if (!error && changesPath && hasChanges) {
    try {
      const fs = await import('fs');
      if (fs.existsSync(changesPath)) {
        attachments.push(changesPath);
      }
    } catch {}
  }

  return await sendEmail({
    to: recipients,
    subject,
    text,
    html,
    attachments
  });
}

/**
 * Send email notification for main scraper completion
 * @param {Object} options
 * @param {string} options.buildingName - Building name
 * @param {string} options.outputPath - Path to output Excel file
 * @param {string} [options.changesPath] - Path to changes Excel file
 * @param {number} options.propertiesExtracted - Number of properties extracted
 * @param {boolean} options.hasChanges - Whether changes were detected
 * @param {string} [options.error] - Error message if failed
 */
export async function sendMainScraperCompletionEmail({ buildingName, outputPath, changesPath, propertiesExtracted, hasChanges, error }) {
  const recipients = (process.env.ALERT_EMAILS || process.env.FINCA_EMAIL_RECIPIENTS || '')
    .split(/[;,]+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    console.log('ℹ️  No ALERT_EMAILS configured; skipping email notification.');
    console.log('   Set ALERT_EMAILS or FINCA_EMAIL_RECIPIENTS in .env to enable emails');
    return false;
  }

  console.log(`📧 Preparing email notification to: ${recipients.join(', ')}`);

  const subject = error
    ? `❌ Main Scraper Failed: ${buildingName}`
    : hasChanges
    ? `📊 Main Scraper: Changes Detected for ${buildingName}`
    : `✅ Main Scraper Completed: ${buildingName}`;

  let text = '';
  let html = '';

  if (error) {
    text = `Main Scraper Error\n\n`;
    text += `Building: ${buildingName}\n`;
    text += `Error: ${error}\n`;
    text += `Time: ${new Date().toLocaleString()}\n`;

    html = `
      <h2>Main Scraper Error</h2>
      <p><strong>Building:</strong> ${buildingName}</p>
      <p><strong>Error:</strong> <code>${error}</code></p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    `;
  } else {
    text = `Main Scraper Results\n\n`;
    text += `Building: ${buildingName}\n`;
    text += `Properties Extracted: ${propertiesExtracted}\n`;
    text += `Changes Detected: ${hasChanges ? 'Yes' : 'No'}\n`;
    text += `Output File: ${outputPath}\n`;
    if (changesPath && hasChanges) {
      text += `Changes File: ${changesPath}\n`;
    }
    text += `Time: ${new Date().toLocaleString()}\n`;

    html = `
      <h2>Main Scraper Results</h2>
      <p><strong>Building:</strong> ${buildingName}</p>
      <p><strong>Properties Extracted:</strong> ${propertiesExtracted}</p>
      <p><strong>Changes Detected:</strong> ${hasChanges ? '<span style="color: red;">Yes</span>' : '<span style="color: green;">No</span>'}</p>
      <p><strong>Output File:</strong> <code>${outputPath}</code></p>
      ${changesPath && hasChanges ? `<p><strong>Changes File:</strong> <code>${changesPath}</code></p>` : ''}
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    `;

    if (hasChanges) {
      text += `\n⚠️  Changes were detected. Please review the changes file.\n`;
      html += `<p style="color: red; font-weight: bold;">⚠️  Changes were detected. Please review the changes file.</p>`;
    }
  }

  const attachments = [];
  // Always attach main output file if it exists (even when no changes)
  if (!error && outputPath) {
    try {
      const fs = await import('fs');
      if (fs.existsSync(outputPath)) {
        attachments.push(outputPath);
      }
    } catch {}
  }
  // Also attach changes file if changes were detected
  if (!error && changesPath && hasChanges) {
    try {
      const fs = await import('fs');
      if (fs.existsSync(changesPath)) {
        attachments.push(changesPath);
      }
    } catch {}
  }

  return await sendEmail({
    to: recipients,
    subject,
    text,
    html,
    attachments
  });
}

/**
 * Send the daily monitoring result for a confirmed subscription (see lib/dailyScheduler.js).
 * Used for both the "no changes" and "something changed" outcomes, and for extraction errors.
 * @param {Object} options
 * @param {string} options.recipientEmail
 * @param {string} options.displayName - property/company/foundation name or Folio for the email subject/body
 * @param {boolean} options.hasChanges
 * @param {boolean} [options.isFirstRun] - true when there was no previous snapshot to compare against
 * @param {string[]} [options.changeLines] - plain-language bullet points describing what changed (already in the subscriber's language — see lib/changeDetection.js's `lang` param)
 * @param {string} [options.pdfPath] - path to today's PDF report to attach
 * @param {string} [options.error]
 * @param {'es'|'en'} [options.language] - subscriber's language preference from signup; defaults to Spanish
 */
export async function sendMonitoringUpdateEmail({ recipientEmail, displayName, hasChanges, isFirstRun, changeLines = [], pdfPath, error, language }) {
  if (!recipientEmail) {
    console.log('ℹ️  No recipient email for monitoring update; skipping.');
    return false;
  }

  const { t } = await import('./emailTranslations.js');
  const lang = language === 'en' ? 'en' : 'es';

  const subject = error
    ? t(lang, 'monitor.errorSubject', { displayName })
    : isFirstRun
    ? t(lang, 'monitor.firstRunSubject', { displayName })
    : hasChanges
    ? t(lang, 'monitor.changeSubject', { displayName })
    : t(lang, 'monitor.noChangesSubject', { displayName });

  const disclaimerText = t(lang, 'monitor.disclaimerText');
  const disclaimerHtml = t(lang, 'monitor.disclaimerHtml');

  let text, html;
  if (error) {
    text = t(lang, 'monitor.errorText', { displayName, error });
    html = t(lang, 'monitor.errorHtml', { displayName, error });
  } else if (isFirstRun) {
    text = t(lang, 'monitor.firstRunText', { displayName, disclaimer: disclaimerText });
    html = t(lang, 'monitor.firstRunHtml', { displayName, disclaimerHtml });
  } else if (hasChanges) {
    const bulletsText = changeLines.map(l => `  • ${l}`).join('\n');
    const bulletsHtml = changeLines.map(l => `<li>${l}</li>`).join('');
    text = t(lang, 'monitor.changesText', { displayName, bullets: bulletsText, disclaimer: disclaimerText });
    html = t(lang, 'monitor.changesHtml', { displayName, bulletsHtml, disclaimerHtml });
  } else {
    text = t(lang, 'monitor.noChangesText', { displayName });
    html = t(lang, 'monitor.noChangesHtml', { displayName });
  }

  const attachments = [];
  if (!error && pdfPath) {
    try {
      const fs = await import('fs');
      if (fs.existsSync(pdfPath)) attachments.push(pdfPath);
    } catch {}
  }

  return await sendEmail({ to: recipientEmail, subject, text, html, attachments });
}

/**
 * Test email configuration
 */
export async function testEmailConfig() {
  const recipients = (process.env.FINCA_EMAIL_RECIPIENTS || process.env.ALERT_EMAILS || '')
    .split(/[;,]+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    console.log('⚠️  No email recipients configured (FINCA_EMAIL_RECIPIENTS or ALERT_EMAILS)');
    return false;
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.log('⚠️  SMTP not configured. Please set:');
    console.log('   SMTP_HOST (e.g., smtp.gmail.com)');
    console.log('   SMTP_PORT (e.g., 587)');
    console.log('   SMTP_USER (your email)');
    console.log('   SMTP_PASS (your password or app password)');
    console.log('\n💡 For Gmail: Use an App Password, not your regular password!');
    console.log('   Get one at: https://myaccount.google.com/apppasswords');
    return false;
  }

  try {
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully');
    
    // Send test email
    const result = await sendEmail({
      to: recipients,
      subject: 'Test Email from Panama Scraper',
      text: 'This is a test email from the Panama Scraper. If you receive this, email configuration is working correctly.',
      html: '<p>This is a test email from the Panama Scraper.</p><p>If you receive this, email configuration is working correctly.</p>'
    });

    return result;
  } catch (error) {
    console.error('❌ SMTP verification failed:', error.message);
    return false;
  }
}

export default {
  sendEmail,
  sendFincaCompletionEmail,
  sendMainScraperCompletionEmail,
  sendMonitoringUpdateEmail,
  testEmailConfig
};

