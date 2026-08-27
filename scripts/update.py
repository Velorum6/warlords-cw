#!/usr/bin/env python3
"""Fetch published Warlords clan wars, replay Glicko-2, write the static ladder."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from glicko2 import (
    DEFAULT_RD,
    DEFAULT_RATING,
    DEFAULT_VOL,
    SCALE,
    TAU,
    Rating,
    expected_delta,
    self_check,
    update_period,
)

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
DIST = ROOT / "dist"
DATA = ROOT / "data"

BASE = "https://mbwarlords.com/api/v1/"
PAGE_SIZE = 50
USER_AGENT = "warlords-cw/1.0 (unofficial GitHub Pages fan ladder)"
RANKED_MIN_WARS = 5
ESTABLISHED_MIN_WARS = 15
ESTABLISHED_MAX_UNCERTAINTY = 100.0
# Four first-to-3 sets → max 12–0. A +1 win still pays; a 12–0 pays 1.0.
MARGIN_MAX = 12.0
WIN_FLOOR = 0.64
EXAMPLE_WIN = (12, 4)


def match_score(s_for: int, s_against: int) -> float:
    """Glicko result in [0, 1]. Draws are 0.5. Wins map +1…+12 onto WIN_FLOOR…1.0."""
    diff = s_for - s_against
    if diff == 0:
        return 0.5
    span = min(abs(diff) / MARGIN_MAX, 1.0)
    mag = WIN_FLOOR + (1.0 - WIN_FLOOR) * span
    return mag if diff > 0 else 1.0 - mag


def check_match_score() -> None:
    assert match_score(7, 7) == 0.5
    assert match_score(12, 0) == 1.0
    assert match_score(0, 12) == 0.0
    close = WIN_FLOOR + (1.0 - WIN_FLOOR) / MARGIN_MAX
    assert abs(match_score(11, 10) - close) < 1e-12
    assert abs(match_score(10, 11) - (1.0 - close)) < 1e-12
    assert abs(match_score(12, 4) + match_score(4, 12) - 1.0) < 1e-12


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_json(path: str, retries: int = 4) -> dict:
    url = urllib.parse.urljoin(BASE, path)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
            last_err = err
            time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"GET {url} failed: {last_err}") from last_err


def fetch_all_wars() -> list[dict]:
    first = get_json(f"clan-wars?page=1&pageSize={PAGE_SIZE}")
    total_pages = int(first.get("totalPages") or 1)
    items = list(first.get("items") or [])
    print(f"page 1/{total_pages}  total={first.get('total')}  got={len(items)}", flush=True)
    for page in range(2, total_pages + 1):
        payload = get_json(f"clan-wars?page={page}&pageSize={PAGE_SIZE}")
        batch = list(payload.get("items") or [])
        items.extend(batch)
        print(f"page {page}/{total_pages}  got={len(batch)}  cumulative={len(items)}", flush=True)
        time.sleep(0.15)
    return items


def parse_time(value: object) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    text = value.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def usable_match(war: dict) -> tuple[bool, str]:
    if (war.get("status") or "").lower() != "published":
        return False, "not_published"
    if war.get("cancelledAt"):
        return False, "cancelled"
    clan1 = war.get("clan1") or {}
    clan2 = war.get("clan2") or {}
    if not clan1.get("id") or not clan2.get("id"):
        return False, "missing_clan"
    if clan1.get("id") == clan2.get("id"):
        return False, "same_clan"
    try:
        s1 = int(war.get("scoreTeam1"))
        s2 = int(war.get("scoreTeam2"))
    except (TypeError, ValueError):
        return False, "missing_score"
    if s1 < 0 or s2 < 0:
        return False, "negative_score"
    stopped = parse_time(war.get("stoppedAt"))
    published = parse_time(war.get("publishedAt"))
    if stopped is None and published is None:
        return False, "no_time"
    return True, "ok"


@dataclass
class Clan:
    clan_id: str
    name: str
    tag: str
    rating: Rating = field(default_factory=Rating)
    wins: int = 0
    losses: int = 0
    draws: int = 0
    wars: int = 0
    last_played: str = ""
    opp_ids: list[str] = field(default_factory=list)
    avg_opp: float = DEFAULT_RATING

    def touch_identity(self, blob: dict) -> None:
        if blob.get("name"):
            self.name = blob["name"]
        if blob.get("tag"):
            self.tag = blob["tag"]


def select_matches(wars: list[dict]) -> tuple[list[dict], dict[str, int]]:
    skipped: dict[str, int] = {}
    matches: list[dict] = []
    for war in wars:
        ok, reason = usable_match(war)
        if not ok:
            skipped[reason] = skipped.get(reason, 0) + 1
            continue
        stopped = parse_time(war.get("stoppedAt"))
        published = parse_time(war.get("publishedAt"))
        when = stopped or published
        matches.append(
            {
                "id": war["id"],
                "when": when.isoformat(),
                "stopped": stopped.isoformat() if stopped else "",
                "published": published.isoformat() if published else "",
                "clan1": war["clan1"],
                "clan2": war["clan2"],
                "s1": int(war["scoreTeam1"]),
                "s2": int(war["scoreTeam2"]),
            }
        )
    matches.sort(
        key=lambda m: (
            m["stopped"] or m["published"],
            m["published"] or m["stopped"],
            m["id"],
        )
    )
    return matches, skipped


def war_row(match: dict) -> dict:
    def side(blob: dict) -> dict:
        return {
            "id": blob.get("id") or "",
            "tag": blob.get("tag") or "",
            "name": blob.get("name") or "",
        }

    return {
        "when": match["when"],
        "clan1": side(match["clan1"]),
        "clan2": side(match["clan2"]),
        "s1": match["s1"],
        "s2": match["s2"],
    }


def history_wars(matches: list[dict]) -> list[dict]:
    return [war_row(m) for m in reversed(matches)]


def replay(matches: list[dict]) -> dict[str, Clan]:
    clans: dict[str, Clan] = {}

    def clan(blob: dict) -> Clan:
        cid = blob["id"]
        row = clans.get(cid)
        if row is None:
            row = Clan(
                clan_id=cid,
                name=blob.get("name") or cid,
                tag=blob.get("tag") or "",
            )
            clans[cid] = row
        else:
            row.touch_identity(blob)
        return row

    for match in matches:
        a = clan(match["clan1"])
        b = clan(match["clan2"])
        s1, s2 = match["s1"], match["s2"]
        sa = match_score(s1, s2)
        sb = match_score(s2, s1)

        a_opp = a.rating.snapshot()
        b_opp = b.rating.snapshot()
        update_period(a.rating, [(b_opp, sa)])
        update_period(b.rating, [(a_opp, sb)])

        for side, scored, conceded, opp_id in (
            (a, s1, s2, b.clan_id),
            (b, s2, s1, a.clan_id),
        ):
            side.wars += 1
            side.opp_ids.append(opp_id)
            side.last_played = match["when"]
            if scored > conceded:
                side.wins += 1
            elif scored < conceded:
                side.losses += 1
            else:
                side.draws += 1

    for row in clans.values():
        if row.opp_ids:
            row.avg_opp = sum(clans[oid].rating.rating for oid in row.opp_ids) / len(row.opp_ids)
    return clans


def by_tag(clans: dict[str, Clan], tag: str) -> Clan | None:
    tagged = [c for c in clans.values() if (c.tag or "").upper() == tag.upper()]
    if not tagged:
        return None
    tagged.sort(key=lambda c: (-c.wars, -c.rating.rating))
    return tagged[0]


def by_name_contains(clans: dict[str, Clan], needle: str) -> Clan | None:
    needle = needle.lower()
    hits = [c for c in clans.values() if needle in (c.name or "").lower()]
    if not hits:
        return None
    hits.sort(key=lambda c: (-c.wars, -c.rating.rating))
    return hits[0]


def clan_brief(row: Clan) -> dict:
    win_pct = 100.0 * row.wins / row.wars if row.wars else 0.0
    return {
        "id": row.clan_id,
        "tag": row.tag,
        "name": row.name,
        "rating": round(row.rating.rating, 1),
        "uncertainty": round(row.rating.rd, 1),
        "avgOpp": round(row.avg_opp, 1),
        "wins": row.wins,
        "losses": row.losses,
        "draws": row.draws,
        "winPct": round(win_pct, 1),
        "wars": row.wars,
        "lastPlayed": row.last_played[:10] if row.last_played else "",
        "established": row.wars >= ESTABLISHED_MIN_WARS
        and row.rating.rd < ESTABLISHED_MAX_UNCERTAINTY,
    }


def explain_payload(clans: dict[str, Clan]) -> dict:
    out: dict = {}
    mf = by_tag(clans, "MF")
    if mf:
        beats = []
        for tag in ("DM", "EQUE", "VPL"):
            opp = by_tag(clans, tag)
            if not opp:
                continue
            delta = expected_delta(mf.rating, opp.rating, match_score(*EXAMPLE_WIN))
            beats.append(
                {
                    "tag": opp.tag,
                    "rating": round(opp.rating.rating, 1),
                    "delta": round(delta, 1),
                }
            )
        out["mf"] = {
            "tag": mf.tag,
            "name": mf.name,
            "rating": round(mf.rating.rating, 1),
            "wars": mf.wars,
            "exampleScore": f"{EXAMPLE_WIN[0]}–{EXAMPLE_WIN[1]}",
            "beats": beats,
        }
        dm = by_tag(clans, "DM")
        if dm:
            out["mf"]["marginDemo"] = {
                "tag": dm.tag,
                "close": round(expected_delta(mf.rating, dm.rating, match_score(11, 10)), 1),
                "solid": round(expected_delta(mf.rating, dm.rating, match_score(*EXAMPLE_WIN)), 1),
                "stomp": round(expected_delta(mf.rating, dm.rating, match_score(12, 0)), 1),
            }
    for key, tag in (("kol", "KoL"), ("ie", "IE")):
        row = by_tag(clans, tag)
        if row:
            out[key] = clan_brief(row)
    forsaken = by_tag(clans, "FOR") or by_name_contains(clans, "forsaken")
    if forsaken:
        out["forsaken"] = clan_brief(forsaken)
    return out


def build_payload(wars: list[dict], matches: list[dict], skipped: dict[str, int], clans: dict[str, Clan]) -> dict:
    ranked = [c for c in clans.values() if c.wars >= RANKED_MIN_WARS]
    ranked.sort(key=lambda c: (-c.rating.rating, c.rating.rd, -c.wars, c.tag))
    established = [
        c
        for c in ranked
        if c.wars >= ESTABLISHED_MIN_WARS and c.rating.rd < ESTABLISHED_MAX_UNCERTAINTY
    ]
    times = [m["when"] for m in matches]
    return {
        "generatedAt": utc_now().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": BASE + "clan-wars",
        "disclaimer": "Unofficial fan ladder. Not affiliated with Warlords or TaleWorlds.",
        "counts": {
            "downloaded": len(wars),
            "used": len(matches),
            "skipped": skipped,
            "clans": len(clans),
            "ranked": len(ranked),
            "established": len(established),
        },
        "filters": {
            "establishedMinWars": ESTABLISHED_MIN_WARS,
            "establishedMaxUncertainty": ESTABLISHED_MAX_UNCERTAINTY,
            "rankedMinWars": RANKED_MIN_WARS,
        },
        "model": {
            "startRating": DEFAULT_RATING,
            "startUncertainty": DEFAULT_RD,
            "startVol": DEFAULT_VOL,
            "tau": TAU,
            "scale": SCALE,
            "period": "one published war",
            "marginMax": MARGIN_MAX,
            "winFloor": WIN_FLOOR,
            "notes": "Win maps round gap +1…+12 onto 0.64…1.0. Draw = 0.5. W–L–D is still who scored more.",
        },
        "firstMatch": times[0] if times else None,
        "lastMatch": times[-1] if times else None,
        "explain": explain_payload(clans),
        "clans": [clan_brief(c) for c in ranked],
    }


def inject_html(template_name: str, placeholder: str, obj: dict) -> None:
    html = (SITE / template_name).read_text(encoding="utf-8")
    if placeholder not in html:
        raise RuntimeError(f"site/{template_name} is missing {placeholder}")
    compact = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).replace("<", "\\u003c")
    (DIST / template_name).write_text(html.replace(placeholder, compact), encoding="utf-8")


def write_outputs(payload: dict, history: list[dict]) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    DIST.mkdir(parents=True, exist_ok=True)
    (DIST / "data").mkdir(parents=True, exist_ok=True)

    pretty = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    (DATA / "ratings.json").write_text(pretty, encoding="utf-8")
    (DIST / "data" / "ratings.json").write_text(pretty, encoding="utf-8")

    wars_store = {"wars": history}
    wars_pretty = json.dumps(wars_store, indent=2, ensure_ascii=False) + "\n"
    (DATA / "wars.json").write_text(wars_pretty, encoding="utf-8")
    (DIST / "data" / "wars.json").write_text(wars_pretty, encoding="utf-8")

    inject_html("index.html", "__LADDER_JSON__", payload)
    inject_html(
        "wars.html",
        "__WARS_JSON__",
        {
            "generatedAt": payload["generatedAt"],
            "count": len(history),
            "wars": history,
        },
    )
    for name in ("styles.css", "app.js", "wars.js"):
        (DIST / name).write_text((SITE / name).read_text(encoding="utf-8"), encoding="utf-8")
    (DIST / ".nojekyll").write_text("", encoding="utf-8")


def main() -> int:
    self_check()
    check_match_score()
    wars = fetch_all_wars()
    if not wars:
        print("API returned no wars", file=sys.stderr)
        return 1
    matches, skipped = select_matches(wars)
    if not matches:
        print(f"no usable wars (skipped={skipped})", file=sys.stderr)
        return 1
    clans = replay(matches)
    payload = build_payload(wars, matches, skipped, clans)
    history = history_wars(matches)
    write_outputs(payload, history)
    print(f"used={len(matches)} skipped={skipped} clans={payload['counts']['clans']}")
    print(f"wrote {DATA / 'ratings.json'}, {DATA / 'wars.json'} and {DIST / 'index.html'}")
    print("\nTop 10 established:")
    shown = 0
    for row in payload["clans"]:
        if not row["established"]:
            continue
        shown += 1
        print(
            f"{shown:2d}  {row['rating']:7.1f}  u{row['uncertainty']:5.1f}  "
            f"opp{row['avgOpp']:7.1f}  {row['wins']:3d}-{row['losses']:<3d}-{row['draws']:<2d}  "
            f"[{row['tag']:<6}] {row['name']}"
        )
        if shown >= 10:
            break
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
