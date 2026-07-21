/**
 * Bible Study — Cloudflare Worker Proxy (YouVersion Platform API — NIV)
 *
 * SETUP (one-time, ~5 minutes):
 * ──────────────────────────────
 * 1. Get a free YouVersion Platform API key (App Key), no credit card required:
 *    https://platform.youversion.com
 * 2. Go to https://workers.cloudflare.com  →  sign up free
 * 3. Click "Create a Worker"
 * 4. Delete all existing code in the editor and paste THIS entire file
 * 5. Click "Save and Deploy"
 * 6. Copy your Worker URL (looks like: https://bible-study.YOURNAME.workers.dev)
 *
 * ADD YOUR API KEY AS A SECRET:
 * 7. In the Worker dashboard → click "Settings" tab → "Variables and Secrets"
 * 8. Click "Add" →
 *    Name:  YOUVERSION_API_KEY
 *    Value: your App Key from platform.youversion.com
 * 9. Save (encrypted) and redeploy if prompted.
 *
 * PASTE YOUR WORKER URL INTO THE APP:
 * 10. Open js/youversion.js → update the WORKER_URL constant near the top to
 *     the URL from step 6 (only needed if you named your Worker something
 *     other than "bible-study" — the default already assumes that name).
 *     Done — NIV now works for every visitor with zero setup; the API key
 *     never reaches the browser.
 */

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// ── /passage?ref=GEN.1[&bibleId=111] — one chapter of Bible text ──
// Pure passthrough: forward to YouVersion's passages endpoint with our own
// secret key appended, and hand back its response verbatim so the existing
// client-side parseChapterHtml() needs no changes. bibleId defaults to 111
// (NIV) but is accepted as an override for anyone who wants a different
// YouVersion catalog translation using the same shared key.
async function handlePassage(request, env, url) {
  if (!env.YOUVERSION_API_KEY) {
    return new Response(
      JSON.stringify({ error: { message: 'YouVersion API key not configured in Worker secrets. See setup instructions.' } }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

  const ref = url.searchParams.get('ref');
  if (!ref) {
    return new Response(
      JSON.stringify({ error: { message: 'Missing required "ref" query parameter (e.g. GEN.1).' } }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }
  const bibleId = url.searchParams.get('bibleId') || '111';

  const upstreamUrl = `https://api.youversion.com/v1/bibles/${encodeURIComponent(bibleId)}/passages/${encodeURIComponent(ref)}?format=html&include_headings=false&include_notes=false`;
  const upstream = await fetch(upstreamUrl, {
    headers: { 'X-YVP-App-Key': env.YOUVERSION_API_KEY }
  });
  const text = await upstream.text();

  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);

    if (url.pathname === '/passage') {
      return handlePassage(request, env, url);
    }

    return new Response('Not found', { status: 404 });
  }
};
