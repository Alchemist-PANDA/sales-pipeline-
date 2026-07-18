/**
 * ============================================================================
 *  AUTOMATED SESSION CAPTURE  —  one-click login, zero manual cookie hunting
 * ============================================================================
 *
 *  The usual pain for cookie-auth sites (LinkedIn, Glassdoor, Wellfound…) is
 *  making each of 30 teammates open devtools, find the session cookie, and
 *  paste it. That is exactly the "messy manual work" we're eliminating.
 *
 *  Instead: a teammate submits their email + password ONCE (over the magic
 *  link, on their phone). The scraping engine drives a real stealth browser,
 *  logs in as them, and harvests the session cookie automatically. We store
 *  only the resulting cookie (sealed) — the password is used in-memory and
 *  never persisted. From then on the pool scrapes as that logged-in owner.
 *
 *  DEMO MODE returns a deterministic synthetic cookie so the whole one-click
 *  flow is demonstrable with no real accounts. LIVE_MODE runs the real login.
 */

import crypto from 'node:crypto';
import { DEMO } from '../connectors/base.js';

/** Where each platform's session cookie lives + how we log in. */
interface LoginSpec {
  loginUrl: string;
  cookieName: string;
  cookieDomain: string;
  userSel: string;
  passSel: string;
  submitSel: string;
  successSel: string; // element that only appears once logged in
}

const LOGIN_SPECS: Record<string, LoginSpec> = {
  linkedin: {
    loginUrl: 'https://www.linkedin.com/login',
    cookieName: 'li_at',
    cookieDomain: '.linkedin.com',
    userSel: '#username',
    passSel: '#password',
    submitSel: 'button[type="submit"]',
    successSel: '#global-nav, .feed-identity-module',
  },
  glassdoor: {
    loginUrl: 'https://www.glassdoor.com/profile/login_input.htm',
    cookieName: 'GDSession',
    cookieDomain: '.glassdoor.com',
    userSel: '#inlineUserEmail, input[name="username"]',
    passSel: '#inlineUserPassword, input[name="password"]',
    submitSel: 'button[type="submit"]',
    successSel: '[data-test="site-header-profile"]',
  },
  wellfound: {
    loginUrl: 'https://wellfound.com/login',
    cookieName: '_wellfound',
    cookieDomain: '.wellfound.com',
    userSel: 'input[name="user[email]"]',
    passSel: 'input[name="user[password]"]',
    submitSel: 'input[type="submit"], button[type="submit"]',
    successSel: '[data-test="currentUserAvatar"]',
  },
  capterra: {
    loginUrl: 'https://www.capterra.com/users/sign_in',
    cookieName: 'session_id',
    cookieDomain: '.capterra.com',
    userSel: 'input[name="email"]',
    passSel: 'input[name="password"]',
    submitSel: 'button[type="submit"]',
    successSel: '[class*="user-menu"]',
  },
  trustradius: {
    loginUrl: 'https://www.trustradius.com/login',
    cookieName: 'session_id',
    cookieDomain: '.trustradius.com',
    userSel: 'input[name="email"]',
    passSel: 'input[name="password"]',
    submitSel: 'button[type="submit"]',
    successSel: '[class*="account-menu"]',
  },
  clutch: {
    loginUrl: 'https://clutch.co/user/login',
    cookieName: 'session_id',
    cookieDomain: '.clutch.co',
    userSel: 'input[name="email"]',
    passSel: 'input[name="pass"]',
    submitSel: 'button[type="submit"], #edit-submit',
    successSel: '.user-account, [class*="logged-in"]',
  },
  thomasnet: {
    loginUrl: 'https://www.thomasnet.com/account/login',
    cookieName: 'session_id',
    cookieDomain: '.thomasnet.com',
    userSel: 'input[name="email"]',
    passSel: 'input[name="password"]',
    submitSel: 'button[type="submit"]',
    successSel: '[class*="account"]',
  },
  manta: {
    loginUrl: 'https://www.manta.com/login',
    cookieName: 'session_id',
    cookieDomain: '.manta.com',
    userSel: 'input[name="email"]',
    passSel: 'input[name="password"]',
    submitSel: 'button[type="submit"]',
    successSel: '[class*="dashboard"], [class*="account"]',
  },
};

export function supportsSessionCapture(platformId: string): boolean {
  return platformId in LOGIN_SPECS;
}

export interface CaptureResult {
  ok: boolean;
  cookieName?: string;
  cookieValue?: string;
  cookieDomain?: string;
  detail: string;
}

/**
 * Drive a real (or simulated) browser login and harvest the session cookie.
 * The password is used only in-memory here and is never returned or stored.
 */
export async function captureSession(
  platformId: string,
  email: string,
  password: string,
): Promise<CaptureResult> {
  const spec = LOGIN_SPECS[platformId];
  if (!spec) return { ok: false, detail: `No login flow defined for ${platformId}` };
  if (!email || !password) return { ok: false, detail: 'Email and password required' };

  // DEMO: deterministic synthetic cookie — the one-click flow works end-to-end
  // without real accounts. Same shape the live path produces.
  if (DEMO) {
    const value = crypto
      .createHash('sha256')
      .update(`${platformId}|${email}|session`)
      .digest('hex')
      .slice(0, 40);
    return {
      ok: true,
      cookieName: spec.cookieName,
      cookieValue: `AQ${value}`,
      cookieDomain: spec.cookieDomain,
      detail: `Captured ${spec.cookieName} for ${email} (simulated)`,
    };
  }

  // LIVE: drive the stealth browser, log in, read the session cookie back.
  const { withContext } = await import('./browserPool.js');
  try {
    return await withContext(async (ctx) => {
      const page = await ctx.newPage();
      await page.goto(spec.loginUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.fill(spec.userSel, email);
      await page.fill(spec.passSel, password);
      await page.click(spec.submitSel);
      await page
        .waitForSelector(spec.successSel, { timeout: 20000 })
        .catch(() => null);

      const cookies = await ctx.cookies();
      const target = cookies.find((c) => c.name === spec.cookieName);
      if (!target?.value) {
        return {
          ok: false,
          detail: `Login did not yield ${spec.cookieName} — check credentials or 2FA/CAPTCHA`,
        };
      }
      return {
        ok: true,
        cookieName: target.name,
        cookieValue: target.value,
        cookieDomain: spec.cookieDomain,
        detail: `Captured ${spec.cookieName} for ${email}`,
      };
    });
  } catch (e: any) {
    return { ok: false, detail: `Capture failed: ${e?.message ?? 'unknown error'}` };
  }
}
