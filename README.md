# Warlords CW

Unofficial fan ladder of published EU [Warlords](https://mbwarlords.com/) clan wars (*Mount & Blade II: Bannerlord*).

It is not an official ranking and is not affiliated with Warlords or TaleWorlds.

- Ladder: [velorum6.github.io/warlords-cw](https://velorum6.github.io/warlords-cw/)
- History: [velorum6.github.io/warlords-cw/wars.html](https://velorum6.github.io/warlords-cw/wars.html)

## What it is

A static site that replays every published clan war through Glicko-2 and shows two pages:

| Page | What you get |
| --- | --- |
| **Ladder** | Clan ratings, search, Established / All ranked |
| **History** | Every war used on the board, with that night’s rating change |

Identity is the clan **id**. Tags and names are labels only: two clans can share a tag and are still rated separately. Clans that field several lineups under one id (KoL, EQUE, VW, and others) share one rating. That number is the house, not 1st team vs 2nd team.

The browser never calls `mbwarlords.com`. GitHub Actions fetches the public API, writes `data/ratings.json` and `data/wars.json`, builds static HTML, and deploys GitHub Pages. No API key, no secrets, no `GameServerKey`.

## Fork and publish

Forks do not inherit a live Pages site or a running cron. Do the steps below on **your** repo.

1. **Fork** this repository (keep the name `warlords-cw`, or the Pages URL will use whatever name you chose).
2. Confirm the default branch is **`main`**.
3. **Settings → Pages**: Source = **GitHub Actions** (not “Deploy from a branch”).
4. **Settings → Actions → General**:
   - Allow Actions.
   - Workflow permissions = **Read and write**.
5. Open the **Actions** tab and **enable workflows**. GitHub turns them off on new forks.
6. Run **Update ladder → Run workflow**. The first green run commits the JSON and publishes Pages.
7. If GitHub asks you to approve the `github-pages` environment, approve it once.

Your site will be:

`https://<you>.github.io/<repo>/`

There is nothing to configure after that. Do not add secrets.

### After it is live

The **Update ladder** workflow runs:

- every 20 minutes (`7`, `27`, `47` past the hour, UTC),
- when you push to `main` (README and `data/` changes do not retrigger it),
- when you use **Run workflow**.

GitHub can delay or skip scheduled jobs, especially in the first hours after a fork, and they only fire on the default branch. A successful run always commits JSON (`generatedAt` changes) so the repo counts as active. GitHub otherwise disables cron after **60 days with no repository activity**. If the timer dies, enable workflows again from the Actions tab and run it once by hand.

Pull before you push `main`. The bot commits on a schedule; a force-push will wipe those updates.

## Run it locally

Python 3.11+ (standard library only). A local run **does** hit the public Warlords API; the deployed site does not.

```bash
python scripts/update.py
python -m http.server 8080 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8080/`. `--bind 127.0.0.1` matters on Windows; without it the server may listen on IPv6 only.

`dist/` is generated and gitignored. Edit files under `site/` and `scripts/`, then run `update.py` again.

## How the rating works

Published wars only, two different clan ids, usable scores, not cancelled. Wars are replayed in order of `stoppedAt`, then `publishedAt`.

| | |
| --- | --- |
| Start | 1500 rating, 350 uncertainty, 0.06 volatility |
| Period | One published war |
| Win / loss | Higher `scoreTeam1` / `scoreTeam2`. A draw is 0.5 in Glicko; W–L–D still follows who scored more |
| Margin | A clan war is four sets, first to 3 (max 12–0). Rating uses the round gap: 11–10 → 0.64, 12–0 → 1.0. The loser gets the complement |
| Avg opp | Mean of opponents’ ratings **today**, one count per war — not the rating they had that night |

**Established** is the default board: 15+ wars, uncertainty below 100, and a published war in the last 21 days. Idle clans stay on **All ranked** (5+ wars) and return to Established when they play again. They are not deleted.

Timestamps on the site are Europe/Madrid (CET / CEST).

## Layout

```
site/                 pages, CSS, JS
scripts/update.py     fetch API, replay Glicko-2, write dist/
scripts/glicko2.py    Glicko-2
data/                 committed snapshots (git-scraping)
.github/workflows/    fetch, commit, deploy Pages
```

## What this does not do

Player ratings, Discord, logins, a database, or per-war roster dumps. Splitting multi-team houses needs separate clan ids in Warlords, or a team id on the published war — this site cannot infer lineups from the public list.
