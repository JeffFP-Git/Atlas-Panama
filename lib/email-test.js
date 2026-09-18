#!/usr/bin/env node
// Quick test script for email configuration
// Usage: node lib/email-test.js

import { testEmailConfig } from './email.js';
import dotenv from 'dotenv';

dotenv.config();

(async () => {
  console.log('📧 Testing Email Configuration\n');
  const result = await testEmailConfig();
  process.exit(result ? 0 : 1);
})();

