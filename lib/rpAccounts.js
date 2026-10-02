/**
 * Multiple Registro Público login accounts, for failover when one gets rate-limited
 * or locked out mid-run — not for parallelism. The daily monitoring pipeline stays
 * strictly serial (MAX_CONCURRENCY = 1 in api.js, deliberately) — this only changes
 * which single account that one session uses, retrying with the next account on a
 * login failure instead of just failing outright.
 *
 * Configured via RP_USERNAME/RP_PASSWORD (account 1) plus optional
 * RP_USERNAME_2/RP_PASSWORD_2 through RP_USERNAME_4/RP_PASSWORD_4.
 */

function loadAccounts() {
  const accounts = [];
  if (process.env.RP_USERNAME && process.env.RP_PASSWORD) {
    accounts.push({ username: process.env.RP_USERNAME, password: process.env.RP_PASSWORD });
  }
  for (let i = 2; i <= 4; i++) {
    const username = process.env[`RP_USERNAME_${i}`];
    const password = process.env[`RP_PASSWORD_${i}`];
    if (username && password) accounts.push({ username, password });
  }
  return accounts;
}

let currentIndex = 0;

/** How many accounts are actually configured right now. */
export function accountCount() {
  return loadAccounts().length;
}

/** The account to use for the next login attempt. */
export function getCurrentAccount() {
  const accounts = loadAccounts();
  if (accounts.length === 0) {
    throw new Error('No Registro Público accounts configured (set RP_USERNAME/RP_PASSWORD).');
  }
  return accounts[currentIndex % accounts.length];
}

/** Call after a login failure to make the next getCurrentAccount() call return a different account. */
export function advanceToNextAccount() {
  const accounts = loadAccounts();
  if (accounts.length > 1) {
    currentIndex = (currentIndex + 1) % accounts.length;
    console.log(`[RP Accounts] Switching to account #${currentIndex + 1} of ${accounts.length} (${accounts[currentIndex].username}) after a login failure.`);
  }
}

/**
 * Emergency kill switch (added Oct 2026, after the user's RP accounts started
 * showing login/authentication errors and Claude-for-Chrome's own troubleshooting
 * advice was to pause automated logins entirely while the user investigates by
 * hand). Set RP_LOGINS_PAUSED=1 in Railway to immediately stop every automated
 * Registro Público login/search platform-wide — daily monitoring, new-subscriber
 * signup, everything. Checked at the top-level entry point of each flow, before
 * any browser/network contact with rp.gob.pa. Remove the variable (or set it to
 * anything other than "1") to resume; no redeploy of code is needed either way,
 * just the Railway variable.
 */
export function isLoginsPaused() {
  return String(process.env.RP_LOGINS_PAUSED || '').trim() === '1';
}

/** Throws if logins are currently paused — call at the very top of anything that's about to touch rp.gob.pa. */
export function assertLoginsNotPaused() {
  if (isLoginsPaused()) {
    throw new Error('Registro Público logins are currently paused (RP_LOGINS_PAUSED=1 is set in Railway). Remove that variable to resume.');
  }
}

export default { accountCount, getCurrentAccount, advanceToNextAccount, isLoginsPaused, assertLoginsNotPaused };
