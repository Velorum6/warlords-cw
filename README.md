# Warlords CW

Unofficial fan ladder of [Warlords](https://mbwarlords.com/) clan wars (Mount & Blade II: Bannerlord). Not affiliated with Warlords or TaleWorlds.

Live URL after GitHub Pages is enabled:

`https://<github-user>.github.io/warlords-cw/`

The browser never talks to `mbwarlords.com`. A GitHub Actions workflow fetches the public API, replays Glicko-2, writes `data/ratings.json` plus static HTML, commits the JSON (git-scraping), and deploys Pages.

## How to fork and run it

1. Fork this repository, or create a new GitHub repo named `warlords-cw` and push these files to branch `main`. If `git init` created `master`, run `git branch -M main` before the first push.
2. **Settings → Pages**: Source = **GitHub Actions** (not “Deploy from a branch”).
3. **Settings → Actions → General**: allow Actions. Workflow permissions should be **Read and write**.
4. Open the **Actions** tab and enable workflows if GitHub has them disabled on the fork.
5. Run **Update ladder** → **Run workflow**. The first successful run commits `data/ratings.json` and publishes the site.
6. No API key. No secrets. Do not add a `GameServerKey`.

Scheduled runs are every 20 minutes. GitHub can delay cron jobs, and they only fire on the default branch.

### 60-day cron note

GitHub disables scheduled workflows after **60 days of repository inactivity**. This project commits `data/ratings.json` on every successful run (the payload includes `generatedAt`) so the repo stays active. If you fork and never get a successful run, or you delete the commit step, the cron will eventually stop. Re-enable it from the Actions tab.

## Local build

Python 3.11+ (stdlib only):

```bash
python scripts/update.py
python -m http.server 8080 --directory dist
```

Open `http://127.0.0.1:8080/`. That local run hits the public API; the deployed site does not.

## Rating rules

- Published wars only, two distinct clan ids, usable scores, not cancelled.
- Sorted by `stoppedAt`, then `publishedAt`.
- Winner = higher `scoreTeam1` / `scoreTeam2`. Equal scores are a draw (0.5).
- Identity = clan **id**. Tags and names are labels.
- Start 1500 / uncertainty 350 / vol 0.06 / tau 0.5. One rating period per war.
- Score margin is ignored. Opponent strength is not.
- **Established** = 15+ wars and uncertainty &lt; 100. **All ranked** = 5+ wars.
- Avg opp = mean of opponents’ *current* Rating, one count per war.

## Out of scope (v1)

Player ratings, Discord bot, login, database, round-margin in the rating, and fetching per-war detail payloads.
