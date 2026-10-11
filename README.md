# Football proxy test

A throwaway Vercel project that tests the API-Football key on its own, away from Creator Booth.
It contains the same football proxy Creator Booth uses, a server check, and the checker page.

## Deploy (about 5 minutes)

1. New GitHub repo (private is fine), e.g. `football-proxy-test`. Upload everything in this folder.
   Make sure `api/diag.js` and `api/football/[...path].js` are there.
2. Vercel -> Add New -> Project -> import that repo. Framework Preset: **Other**.
3. Before deploying, open **Environment Variables** and add:
   - Name: `API_SPORTS_KEY`
   - Value: your key from the API-Football dashboard (no spaces, no quotes)
4. Deploy, then open `https://<your-project>.vercel.app`.
5. Tap **Run server check**. It tests the key two ways at once and says in plain English what it found.

## What this project found

The server check showed the key works (even plain `fetch`), while the proxy's `/api/football/status`
route failed with API-Football's misleading "NOT AUTORIZED" message. So the proxy was asking for the
wrong thing: it took the endpoint name from a value Vercel passes in `req.query`, which can arrive
under a different name. If it is lost, the call goes to API-Football's bare root address. The proxy now
reads the endpoint from the real request URL first, and every error shows the path it actually sent.

## Why two tests

API-Football's documentation says the API accepts only the `x-apisports-key` header and that Node.js
"automatically adds extra headers" which must be removed. Node's built-in `fetch` adds five
(`accept`, `accept-language`, `sec-fetch-mode`, `user-agent`, `accept-encoding`). The proxy here
sends a minimal request instead. The server check runs both styles side by side.

## Reading the result

- **"FOUND IT"** - the key is fine; API-Football refuses requests that carry Node's extra headers.
  The proxy in this project already avoids that, so everything below should now work.

- **"The key works"** - the key is fine. The problem is in the main project's Vercel settings
  (wrong variable, wrong environment, or not redeployed after changing it).
- **"...refused a correctly shaped key"** - compare the first/last two characters it shows with the
  key in your API-Football dashboard. If they match, the key is blocked or disabled on their side.
- **"...does not look like a normal 32-character key"** - the pasted value is wrong or incomplete.
- **"not set for this deployment"** - add the variable and redeploy (a variable change never affects
  an existing deployment).

## Afterwards

The test endpoints are public, so anyone who finds the address could use up your 100 daily requests.
Delete the project when you are done.
