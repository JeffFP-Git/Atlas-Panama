import puppeteer from 'puppeteer';

export async function getPuppeteerLib() {
  // Try puppeteer-extra + stealth; attach recaptcha plugin if provider/token present and mode not 'off'
  try {
    const puppeteerExtraMod = await import('puppeteer-extra').catch(() => null);
    if (puppeteerExtraMod && puppeteerExtraMod.default) {
      try {
        const stealthMod = await import('puppeteer-extra-plugin-stealth').catch(() => null);
        if (stealthMod && stealthMod.default) {
          puppeteerExtraMod.default.use(stealthMod.default());
        }
      } catch {}
      // Attach recaptcha plugin when allowed
      try {
        const mode = (process.env.CAPTCHA_MODE || 'backup').toString().toLowerCase();
        const providerRaw = (process.env.CAPTCHA_PROVIDER || '').toLowerCase();
        const provider = providerRaw || (process.env.CAPTCHA_API_KEY ? '2captcha' : '');
        const token = (process.env.CAPTCHA_API_KEY || '').trim();
        if (mode !== 'off' && provider && token) {
          const recaptchaMod = await import('puppeteer-extra-plugin-recaptcha').catch(() => null);
          if (recaptchaMod && recaptchaMod.default) {
            puppeteerExtraMod.default.use(
              recaptchaMod.default({
                provider: { id: provider, token },
                visualFeedback: true
              })
            );
            const masked = token.length > 8 ? `${token.slice(0, 4)}…${token.slice(-4)}` : '[set]';
            if (process.env.CAPTCHA_DEBUG === '1' || process.env.CAPTCHA_DEBUG === 'true') {
              console.log(`🔧 CAPTCHA solver enabled (${provider}), key=${masked}`);
            } else {
              console.log(`🔧 CAPTCHA solver enabled (${provider}).`);
            }
          }
        }
      } catch {}
      return puppeteerExtraMod.default;
    }
  } catch {}
  // Fallback to base puppeteer
  return puppeteer;
}

export default { getPuppeteerLib };


