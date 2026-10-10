// /api/diag — one-tap server check for the API-Football key.
// Reads the key the same way the proxy does, calls API-Football's free /status endpoint with it,
// and explains in plain English what is wrong. The key itself is never returned: only its length
// and its first/last two characters (so you can tell whether the right key was pasted).

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const rawKey = process.env.API_SPORTS_KEY || '';
  const key = rawKey.trim().replace(/^["'`]+|["'`]+$/g, '').trim();

  const out = {
    env: {
      variableName: 'API_SPORTS_KEY',
      present: rawKey.length > 0,
      length: key.length,
      typicalLength: 32,
      looksLikeA32CharKey: /^[a-f0-9]{32}$/i.test(key),
      hadSpacesQuotesOrNewlines: key !== rawKey,
      startsWith: key.slice(0, 2),
      endsWith: key.slice(-2)
    },
    vercel: {
      environment: process.env.VERCEL_ENV || 'unknown',
      region: process.env.VERCEL_REGION || 'unknown',
      deployment: process.env.VERCEL_URL || 'unknown',
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'n/a'
    },
    probe: null,
    verdict: ''
  };

  if (!key) {
    out.verdict = 'API_SPORTS_KEY is not set for this deployment. Add it in Vercel → Settings → Environment Variables (tick Production), then redeploy.';
    return res.status(200).json(out);
  }

  try {
    const r = await fetch('https://v3.football.api-sports.io/status', { headers: { 'x-apisports-key': key } });
    const data = await r.json().catch(() => null);
    const v3Errors = data && data.errors && !Array.isArray(data.errors) ? data.errors : null;
    const legacyError = data && data.api && data.api.error;
    const rq = data && data.response && data.response.requests;
    const sub = data && data.response && data.response.subscription;
    out.probe = {
      http: r.status,
      format: data ? (data.api ? 'older-style (api.error)' : 'v3') : 'not JSON',
      errors: v3Errors || (legacyError ? { message: String(legacyError) } : null),
      requestsToday: rq ? rq.current : null,
      dailyLimit: rq ? rq.limit_day : null,
      plan: sub ? sub.plan : null,
      planActive: sub ? sub.active : null
    };
    if (rq && !v3Errors && !legacyError) {
      out.verdict = 'The key works. ' + rq.current + ' of ' + rq.limit_day + ' requests used today' + (sub && sub.plan ? ' (plan: ' + sub.plan + ')' : '') + '. If the main app still shows no football data, the problem is not the key.';
    } else if (!out.env.looksLikeA32CharKey) {
      out.verdict = 'API-Football refused the key, and it does not look like a normal 32-character key (length ' + key.length + '). The pasted value is probably wrong or incomplete. Re-copy it from the API-Football dashboard and redeploy.';
    } else {
      out.verdict = 'API-Football refused a correctly shaped key. Starts "' + out.env.startsWith + '" and ends "' + out.env.endsWith + '": compare that with the key in your API-Football dashboard. If it matches, the key itself is blocked or disabled on their side (contact API-Football support), or it belongs to a different account than the one you are looking at.';
    }
  } catch (e) {
    out.probe = { error: String(e && e.message ? e.message : e) };
    out.verdict = 'Could not reach API-Football from Vercel: ' + out.probe.error;
  }
  return res.status(200).json(out);
}
