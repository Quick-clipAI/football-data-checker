// /api/diag — one-tap server check for the API-Football key.
// Tests the key TWO ways at the same moment so the difference is visible:
//   A) Node's built-in fetch(), which silently adds extra headers
//   B) a minimal request that sends only the x-apisports-key header (what the documentation asks for)
// The key itself is never returned: only its length and its first/last two characters.

// ---- Minimal GET ----------------------------------------------------------------------------
// API-Football's documentation says the API accepts ONLY the x-apisports-key header and warns that
// Node.js "automatically adds extra headers" that must be removed. Node's fetch() silently adds
// accept, accept-language, sec-fetch-mode, user-agent and accept-encoding. node:https adds nothing
// beyond Host and Connection, so this sends exactly what the documentation asks for.
import https from 'node:https';
import http from 'node:http';
import zlib from 'node:zlib';

const API_BASE = process.env.API_SPORTS_BASE || 'https://v3.football.api-sports.io';

function minimalGet(urlStr, key, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(u, { method: 'GET', headers: { 'x-apisports-key': key } }, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('error', reject);
      resp.on('end', () => {
        let buf = Buffer.concat(chunks);
        try {
          const enc = String(resp.headers['content-encoding'] || '').toLowerCase();
          if (enc === 'gzip') buf = zlib.gunzipSync(buf);
          else if (enc === 'deflate') buf = zlib.inflateSync(buf);
          else if (enc === 'br') buf = zlib.brotliDecompressSync(buf);
        } catch (e) { /* fall through; JSON parse below will fail and data stays null */ }
        let data = null;
        try { data = JSON.parse(buf.toString('utf8')); } catch (e) { /* not JSON */ }
        resolve({ status: resp.statusCode || 0, data });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('API-Football did not answer within ' + Math.round(timeoutMs / 1000) + 's')));
    req.on('error', reject);
    req.end();
  });
}

function summarise(r) {
  const data = r.data;
  const v3 = data && data.errors && !Array.isArray(data.errors) && typeof data.errors === 'object' && Object.keys(data.errors).length ? data.errors : null;
  const legacy = data && data.api && data.api.error ? String(data.api.error) : null;
  const rq = data && data.response && data.response.requests;
  const sub = data && data.response && data.response.subscription;
  const works = !!(rq && !v3 && !legacy);
  return {
    http: r.status,
    works,
    message: v3 ? JSON.stringify(v3) : legacy,
    requestsToday: rq ? rq.current : null,
    dailyLimit: rq ? rq.limit_day : null,
    plan: sub ? sub.plan : null
  };
}

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
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'n/a'
    },
    tests: null,
    verdict: ''
  };
  if (!key) {
    out.verdict = 'API_SPORTS_KEY is not set for this deployment. Add it in Vercel → Settings → Environment Variables (tick Production), then redeploy.';
    return res.status(200).json(out);
  }

  const url = API_BASE + '/status';
  const attempt = async (fn) => { try { return summarise(await fn()); } catch (e) { return { error: String(e && e.message ? e.message : e), works: false }; } };
  const [A, B] = await Promise.all([
    attempt(async () => { const r = await fetch(url, { headers: { 'x-apisports-key': key } }); return { status: r.status, data: await r.json().catch(() => null) }; }),
    attempt(() => minimalGet(url, key))
  ]);
  out.tests = { A_nodeFetch_extraHeaders: A, B_minimalRequest: B };

  if (A.error && B.error) {
    out.verdict = 'Could not reach API-Football from Vercel: ' + B.error;
  } else if (B.works && !A.works) {
    out.verdict = 'FOUND IT. The key is fine, but API-Football refuses requests made with Node\'s built-in fetch (it adds extra headers the API does not allow). The minimal request works (' + B.requestsToday + ' of ' + B.dailyLimit + ' used today). This project\'s proxy already uses the minimal request, so "Check my plan" should now work too.';
  } else if (B.works && A.works) {
    out.verdict = 'The key works both ways (' + B.requestsToday + ' of ' + B.dailyLimit + ' requests used today, plan: ' + (B.plan || 'unknown') + '). If the main app still shows no football data, the problem is not the key.';
  } else if (!out.env.looksLikeA32CharKey) {
    out.verdict = 'API-Football refused the key both ways, and it does not look like a normal 32-character key (length ' + key.length + '). The pasted value is probably wrong or incomplete.';
  } else {
    out.verdict = 'API-Football refused a correctly shaped key both ways. Starts "' + out.env.startsWith + '" and ends "' + out.env.endsWith + '": check that against the key in the account you are logged into. Next test: the dashboard\'s own tester with the same key. If that fails too, the key or account is blocked on their side (contact API-Football support).';
  }
  return res.status(200).json(out);
}
