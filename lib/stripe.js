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

/**
 * Creates a Stripe Checkout Session for a confirmed subscription request.
 * @param {{ id: string, email: string, accessToken: string }} request
 * @param {'monthly'|'annual'} plan
 * @param {{ successUrl: string, cancelUrl: string }} urls
 */
export async function createCheckoutSession(request, plan, { successUrl, cancelUrl }) {
  const stripe = getStripeClient();
  const { monthlyPriceId, annualPriceId } = await ensurePrices();
  const priceId = plan === 'annual' ? annualPriceId : monthlyPriceId;

  return stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: request.email,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { requestId: request.id, plan }
  });
}

export default { getStripeClient, ensurePrices, createCheckoutSession, PRICING };
