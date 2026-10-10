// /api/football/[...path].js
// Server-side proxy for API-Football, called directly (api-sports.io),
// NOT through the RapidAPI marketplace.
// Solves two problems at once:
//   1. CORS — a same-origin call to our own /api route never hits CORS.
//   2. Key exposure — the key stays in a Vercel env var (API_SPORTS_KEY),
//      never sent to or stored in the browser.
//
// Usage from the frontend:
//   /api/football/status                -> https://v3.football.api-sports.io/status
//   /api/football/fixtures?live=all     -> https://v3.football.api-sports.io/fixtures?live=all
// Any path/query after /api/football/ is forwarded through untouched.

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

export default async function handler(req, res) {
  // CORS: needed now that the Android app (bundled locally, different origin) calls this same
  // endpoint via its absolute URL instead of a same-origin relative path. The comment below
  // predates the app; same-origin calls from the website are still unaffected either way.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Clean up the usual copy-paste accidents in the Vercel variable: spaces, line breaks and
  // wrapping quotes around the key. A key with any of those is rejected as "missing".
  const rawKey = process.env.API_SPORTS_KEY || '';
  const key = rawKey.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!key) {
    return res.status(500).json({
      error: 'Server is missing API_SPORTS_KEY. Add it in Vercel → Project → Settings → Environment Variables, then redeploy.'
    });
  }

  const { path = [] } = req.query;
  const upstreamPath = Array.isArray(path) ? path.join('/') : String(path);

  // Rebuild the query string, dropping the catch-all "path" param Vercel injects.
  const params = new URLSearchParams(req.query);
  params.delete('path');
  const qs = params.toString();

  const url = `${API_BASE}/${upstreamPath}${qs ? '?' + qs : ''}`;

  try {
    const upstream = await minimalGet(url, key);
    const data = upstream.data || {};

    // API-Football reports a rejected key with HTTP 200 and an error inside the body (v3 puts it in
    // errors.token; an older style uses api.error). Passing that through as a "success" hid the real
    // problem, so report it plainly. No part of the key is ever included, only its length.
    if (isKeyRejected(data)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(401).json({
        error: 'API-Football rejected the API key this site is using.',
        upstream: data,
        proxy: {
          keyLength: key.length,
          typicalKeyLength: 32,
          cleanedAutomatically: key !== rawKey,
          requestStyle: 'minimal (only the x-apisports-key header)',
          fix: 'In Vercel → Settings → Environment Variables, re-enter API_SPORTS_KEY (copy it from the API-Football dashboard, no spaces or quotes), then redeploy. Changing a variable does not affect an existing deployment.'
        }
      });
    }

    // Cache lightweight, fast-changing data briefly at the edge to save on quota.
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach API-Football: ' + (err && err.message) });
  }
}

function isKeyRejected(data) {
  if (!data || typeof data !== 'object') return false;
  const v3 = data.errors && !Array.isArray(data.errors) && typeof data.errors === 'object' ? data.errors : null;
  if (v3 && (v3.token || v3.access)) return true;
  const legacy = data.api && data.api.error;
  return typeof legacy === 'string' && /AUTORIZED|AUTHORI[SZ]ED|API KEY|BLOCKED/i.test(legacy);
}
