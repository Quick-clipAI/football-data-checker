# Football data checker

One page, no build step. It asks **your own Vercel site** (`/api/football`) questions, so the API-Football key never
leaves Vercel and nothing is typed into this page.

It shows: your plan and today's request count, how many competitions are covered and what data each has, and
which seasons / data types your plan blocks.

Each test spends 1 of your daily API-Football requests (the plan check is free). Ticked tests are listed with their cost.

## Put it online (GitHub Pages)
1. New public repo, e.g. `football-data-checker`. Upload `index.html` and this README.
2. Settings → Pages → Deploy from a branch → `main` / `(root)` → Save.
3. Open `https://<your-username>.github.io/football-data-checker/`.

Your site must be deployed and allow cross-site calls to `/api/football` (it does).

## If "Check my plan" shows an error

- **"API-Football turned the key down … N characters long":** your site reached API-Football, but the key it sent was refused. Keys are normally 32 characters. Re-enter `API_SPORTS_KEY` in Vercel (copy from the API-Football dashboard, no spaces or quotes) and **redeploy**. Changing a variable does not change a site that is already deployed. This message needs the v1.2.5 or newer version of the main site.
- **A plain "NOT AUTORIZED / API KEY MISSING" message:** same problem, seen through an older version of the main site.
