/**
 * Stripe integration for the Atlas Panama subscription checkout.
 *
 * Pricing lives in Stripe's own Product Catalog, not hardcoded amounts scattered
 * through the app — this file just declares what the CURRENT price should be and
 * makes sure a matching Stripe Price exists (creating one on first run if needed).
 * Prices in Stripe are immutable once created, so raising the price later means
 * bumping PRICING_VERSION below (which mints new Price objects) rather than
 * editing an existing Price. See CLAUDE.md → "Pending decisions" for the
 * $1/mo→$2/mo, $10/yr→$20/yr bump planned once we reach 50 subscribers.
 */
import Stripe from 'stripe';

let stripeClient = null;

export function getStripeClient() {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set in .env');
  stripeClient = new Stripe(key);
  return stripeClient;
}

// Bump this (e.g. 'v2') when the price actually changes — Stripe Prices can't be edited
// in place, so a version bump mints fresh Price objects under the same Product instead
// of trying to mutate old ones.
const PRICING_VERSION = 'v1';

export const PRICING = {
  monthly: { amountCents: 100, currency: 'usd', interval: 'month', lookupKey: `atlas_monthly_${PRICING_VERSION}`, label: '$1/month' },
  annual: { amountCents: 1000, currency: 'usd', interval: 'year', lookupKey: `atlas_annual_${PRICING_VERSION}`, label: '$10/year' }
};

let cachedPriceIds = null;
let productId = null;

/**
 * Ensures the "Atlas Panama Subscription" Product and its monthly/annual Prices exist in
 * Stripe (idempotent — looks them up by lookup_key first, only creates what's missing).
 * @returns {Promise<{ monthlyPriceId: string, annualPriceId: string }>}
 */
export async function ensurePrices() {
  if (cachedPriceIds) return cachedPriceIds;
  const stripe = getStripeClient();

  const lookupKeys = [PRICING.monthly.lookupKey, PRICING.annual.lookupKey];
  const existing = await stripe.prices.list({ lookup_keys: lookupKeys, active: true, limit: 10 });
  const byKey = new Map(existing.data.map(p => [p.lookup_key, p]));

  if (byKey.size > 0 && !productId) {
    productId = byKey.values().next().value.product;
  }
  if (!productId) {
    const product = await stripe.products.create({ name: 'Atlas Panama Subscription', description: 'Daily Registro Público monitoring for a property, Mercantil entity, or Fundación.' });
    productId = product.id;
  }

  async function ensureOne(plan) {
    const found = byKey.get(plan.lookupKey);
    if (found) return found.id;
    const price = await stripe.prices.create({
      product: productId,
      currency: plan.currency,
      unit_amount: plan.amountCents,
      recurring: { interval: plan.interval },
      lookup_key: plan.lookupKey,
      nickname: plan.label
    });
    return price.id;
  }

  const [monthlyPriceId, annualPriceId] = await Promise.all([ensureOne(PRICING.monthly), ensureOne(PRICING.annual)]);
  cachedPriceIds = { monthlyPriceId, annualPriceId };
  return cachedPriceIds;
}

// Stripe shows its "Link" saved-card wallet (a green Link button plus a pre-ticked
// "Save my information for faster checkout" box) even on card-only Checkout, and
// emails people who end up enrolled. Listing payment_method_types doesn't remove it;
// a payment method configuration with Link switched off does. Found or created on
// first use, per Stripe mode (test/live), like the prices above.
const CHECKOUT_PM_CONFIG_NAME = 'Atlas Panama checkout (no Link)';
let cachedPmConfigId = null;

async function ensureCheckoutPaymentMethodConfig() {
  if (cachedPmConfigId) return cachedPmConfigId;
  const stripe = getStripeClient();
  const existing = await stripe.paymentMethodConfigurations.list({ limit: 100 });
  const found = existing.data.find(c => c.name === CHECKOUT_PM_CONFIG_NAME && c.active);
  if (found) {
    cachedPmConfigId = found.id;
    return cachedPmConfigId;
  }
  const created = await stripe.paymentMethodConfigurations.create({
    name: CHECKOUT_PM_CONFIG_NAME,
    card: { display_preference: { preference: 'on' } },
    apple_pay: { display_preference: { preference: 'on' } },
    google_pay: { display_preference: { preference: 'on' } },
    link: { display_preference: { preference: 'off' } }
  });
  cachedPmConfigId = created.id;
  return cachedPmConfigId;
}

// Stripe-hosted "manage my subscription" page (Customer Portal): subscribers update
// their card, see invoices, or cancel (at period end) without contacting us. Every
// email links to it via GET /subscribe/request/:id/manage. The portal configuration
// is found (by metadata) or created on first use, per Stripe mode.
const PORTAL_CONFIG_TAG = 'manage-v2'; // v2: asks for a cancellation reason
let cachedPortalConfigId = null;

async function ensurePortalConfig() {
  if (cachedPortalConfigId) return cachedPortalConfigId;
  const stripe = getStripeClient();
  const existing = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const found = existing.data.find(c => c.metadata?.atlas === PORTAL_CONFIG_TAG);
  if (found) {
    cachedPortalConfigId = found.id;
    return cachedPortalConfigId;
  }
  const baseUrl = process.env.API_BASE_URL || process.env.FRONTEND_URL || 'https://atlaspanama.com';
  const created = await stripe.billingPortal.configurations.create({
    metadata: { atlas: PORTAL_CONFIG_TAG },
    business_profile: { headline: 'Atlas Panama', privacy_policy_url: `${baseUrl}/privacy`, terms_of_service_url: `${baseUrl}/terms` },
    default_return_url: `${baseUrl}/`,
    features: {
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'unused', 'missing_features', 'switched_service', 'too_complex', 'low_quality', 'customer_service', 'other']
        }
      },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: false },
      subscription_update: { enabled: false }
    }
  });
  cachedPortalConfigId = created.id;
  return cachedPortalConfigId;
}

/**
 * Creates a one-time Customer Portal session URL for a Stripe customer.
 * @param {string} customerId
 * @param {'es'|'en'} lang
 */
export async function createManageSession(customerId, lang) {
  const stripe = getStripeClient();
  const baseUrl = process.env.API_BASE_URL || process.env.FRONTEND_URL || 'https://atlaspanama.com';
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    configuration: await ensurePortalConfig(),
    return_url: `${baseUrl}/`,
    locale: lang === 'en' ? 'en' : 'es'
  });
  return session.url;
}

/**
 * Creates a Stripe Checkout Session for a confirmed subscription request.
 * @param {{ id: string, email: string, accessToken: string }} request
 * @param {'monthly'|'annual'} plan
 * @param {{ successUrl: string, cancelUrl: string }} urls
 */
export async function createCheckoutSession(request, plan, { successUrl, cancelUrl, trialDays = 0, trialEnd = null }) {
  const stripe = getStripeClient();
  const { monthlyPriceId, annualPriceId } = await ensurePrices();
  const priceId = plan === 'annual' ? annualPriceId : monthlyPriceId;

  // Card / Apple Pay / Google Pay with Link off. If the configuration can't be set up
  // for any reason, still take the payment card-only rather than fail the checkout.
  let paymentMethodParams;
  try {
    paymentMethodParams = { payment_method_configuration: await ensureCheckoutPaymentMethodConfig() };
  } catch (err) {
    console.error('[Stripe] Could not set up the no-Link payment method configuration, falling back to card-only:', err.message);
    paymentMethodParams = { payment_method_types: ['card'] };
  }

  return stripe.checkout.sessions.create({
    mode: 'subscription',
    ...paymentMethodParams,
    // Show everyone the plain USD price ($1 / $10) — no local-currency display
    // (Jeff's call, Oct 2026).
    adaptive_pricing: { enabled: false },
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: request.email,
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Free trial: Checkout still collects the card (required), charges $0 today, and
    // the subscription starts billing automatically when the trial ends.
    // trialEnd (unix seconds): someone on the no-card trial paying before it ends is
    // charged only when their 30 days are up, so they don't lose free days.
    ...(trialEnd ? { subscription_data: { trial_end: trialEnd } } : trialDays > 0 ? { subscription_data: { trial_period_days: trialDays } } : {}),
    // Trust note next to Stripe's pay button: we never see or store card details.
    custom_text: { submit: { message: request.language === 'en'
      ? 'Your payment is processed by Stripe, which handles payments for more than 5 million businesses worldwide (about $1.9 trillion in 2025). Atlas Panama never sees or stores your card details.'
      : 'Su pago lo procesa Stripe, que maneja los pagos de más de 5 millones de empresas en el mundo (más de $1.9 millones de millones de dólares en 2025). Atlas Panama nunca ve ni guarda los datos de su tarjeta.' } },
    metadata: { requestId: request.id, plan, trial: trialDays > 0 ? 'yes' : 'no' }
  });
}

export default { getStripeClient, ensurePrices, createCheckoutSession, createManageSession, PRICING };
