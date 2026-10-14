import crypto from 'crypto';

const COOKIE = 'rss-session';
const MAX_AGE = 365 * 24 * 60 * 60; // seconds

const sign = value => crypto.createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('hex');

export function sessionCookie() {
  const expires = Date.now() + MAX_AGE * 1000;
  return `${COOKIE}=${expires}.${sign(String(expires))}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function hasValidSession(req) {
  if (!process.env.SESSION_SECRET) return false;
  const raw = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [expires, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  const expected = sign(expires);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
