import { readSubscriptions, writeSubscriptions, MAX_SUBSCRIPTIONS } from './_subscriptions.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // GET: the page needs the public VAPID key to subscribe.
  if (req.method === 'GET') return res.status(200).json({ publicKey: process.env.GARBAGE_VAPID_PUBLIC_KEY });
  if (req.method !== 'POST') return res.status(405).end();

  const subscription = req.body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  const subscriptions = await readSubscriptions();
  const others = subscriptions.filter(s => s.endpoint !== subscription.endpoint);
  if (others.length >= MAX_SUBSCRIPTIONS) {
    return res.status(409).json({ error: 'Reminder limit reached. Remove an old device first.' });
  }

  await writeSubscriptions([...others, subscription]);
  return res.status(200).json({ ok: true });
}
