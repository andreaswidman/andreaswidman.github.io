import { readSubscriptions, writeSubscriptions } from './_subscriptions.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const endpoint = req.body?.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

  const subscriptions = await readSubscriptions();
  await writeSubscriptions(subscriptions.filter(s => s.endpoint !== endpoint));
  return res.status(200).json({ ok: true });
}
