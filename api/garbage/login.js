import crypto from 'crypto';
import { sessionCookie } from './_session.js';

const digest = s => crypto.createHash('sha256').update(String(s)).digest();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { GARBAGE_PASSWORD } = process.env;
  if (!GARBAGE_PASSWORD) return res.status(500).json({ error: 'Auth not configured' });

  const ok = crypto.timingSafeEqual(digest(req.body?.password ?? ''), digest(GARBAGE_PASSWORD));
  if (!ok) {
    await new Promise(resolve => setTimeout(resolve, 500)); // slow down guessing
    return res.status(401).json({ error: 'Wrong password' });
  }

  res.setHeader('Set-Cookie', await sessionCookie());
  return res.status(200).json({ ok: true });
}
