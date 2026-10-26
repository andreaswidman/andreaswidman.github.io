import webpush from 'web-push';
import { reminder, todayInStockholm, stockholmHour } from './_schedule.js';
import { readSubscriptions, writeSubscriptions } from './_subscriptions.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }

  // ?test=1 (still needs the secret) sends a sample push now, whatever the hour or schedule.
  const test = req.query.test === '1';

  // Cron runs in UTC, so it fires at both 19:00 and 20:00; only one of those is 21:00 in Stockholm.
  if (!test && stockholmHour() !== 21) return res.status(200).json({ skipped: 'not 21:00 in Stockholm' });

  const message = test ? { title: 'Put out the garbage', body: 'Test: pickup tomorrow: glass and metal.' } : reminder(todayInStockholm());
  if (!message) return res.status(200).json({ skipped: 'no pickup tomorrow' });

  webpush.setVapidDetails('https://www.andreaswidman.com/garbage/', process.env.GARBAGE_VAPID_PUBLIC_KEY, process.env.GARBAGE_VAPID_PRIVATE_KEY);
  const payload = JSON.stringify({ ...message, url: '/garbage/' });

  const subscriptions = await readSubscriptions();
  const gone = new Set();
  await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification(subscription, payload);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) gone.add(subscription.endpoint);
      else console.error('push failed', err.statusCode, err.body);
    }
  }));

  if (gone.size) await writeSubscriptions(subscriptions.filter(s => !gone.has(s.endpoint)));
  return res.status(200).json({ sent: subscriptions.length - gone.size, pruned: gone.size });
}
