import { view, todayInStockholm } from './_schedule.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  return res.status(200).json(view(todayInStockholm()));
}
