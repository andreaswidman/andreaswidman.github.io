import { get, put } from '@vercel/blob';

const PATHNAME = 'garbage/subscriptions.json';
export const MAX_SUBSCRIPTIONS = 5;

// The store is connected with the GARBAGE prefix, so the SDK's own BLOB_STORE_ID default doesn't apply.
// Auth is Vercel's OIDC token, which the SDK reads from VERCEL_OIDC_TOKEN.
const storeId = () => process.env.GARBAGE_STORE_ID;

export async function readSubscriptions() {
  const result = await get(PATHNAME, { access: 'private', useCache: false, storeId: storeId() });
  if (!result || result.statusCode !== 200) return [];
  return JSON.parse(await new Response(result.stream).text());
}

export function writeSubscriptions(subscriptions) {
  return put(PATHNAME, JSON.stringify(subscriptions), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    storeId: storeId(),
  });
}
