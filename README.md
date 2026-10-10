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
