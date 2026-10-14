import crypto from 'crypto';
import { sessionCookie, hasValidSession } from './_session.js';

const digest = s => crypto.createHash('sha256').update(String(s)).digest();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // GET: is the current session valid?
  if (req.method === 'GET') return res.status(hasValidSession(req) ? 200 : 401).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { AUTH_PASSPHRASE, SESSION_SECRET } = process.env;
  if (!AUTH_PASSPHRASE || !SESSION_SECRET) return res.status(500).json({ error: 'Auth not configured' });

  const ok = crypto.timingSafeEqual(digest(req.body?.passphrase ?? ''), digest(AUTH_PASSPHRASE));
  if (!ok) {
    await new Promise(resolve => setTimeout(resolve, 500)); // slow down guessing
    return res.status(401).json({ error: 'Wrong passphrase' });
  }

  res.setHeader('Set-Cookie', sessionCookie());
  return res.status(200).json({ ok: true });
}
