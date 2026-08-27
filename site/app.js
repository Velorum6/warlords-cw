(() => {
  const raw = document.getElementById("ladder-data");
  if (!raw) return;

  const data = JSON.parse(raw.textContent);
  const clans = data.clans || [];
  const filters = data.filters || {
    establishedMinWars: 15,
    establishedMaxUncertainty: 100,
    establishedMaxIdleDays: 21,
    rankedMinWars: 5,
  };
  if (!Number.isFinite(filters.establishedMaxIdleDays)) {
    filters.establishedMaxIdleDays = 21;
  }

  const state = {
    view: "established",
    query: "",
    sort: "rating",
  };

  const els = {
    updated: document.getElementById("last-updated"),
    counts: document.getElementById("board-counts"),
    search: document.getElementById("search"),
    sort: document.getElementById("sort"),
    established: document.getElementById("btn-established"),
    all: document.getElementById("btn-all"),
    body: document.getElementById("board-body"),
    empty: document.getElementById("board-empty"),
    explain: document.getElementById("explain-dynamic"),
    explainBoard: document.getElementById("explain-board"),
  };

  const TZ = "Europe/Madrid";

  function fmtWhen(iso) {
    if (!iso) return "—";
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso.slice(0, 10);
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: TZ,
      timeZoneName: "short",
    }).format(dt);
  }

  function fmtDay(iso) {
    if (!iso) return "—";
    const dt = new Date(iso.length <= 10 ? iso + "T00:00:00Z" : iso);
    if (Number.isNaN(dt.getTime())) return iso.slice(0, 10);
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: TZ,
    }).format(dt);
  }

  function heatColor(t) {
    const x = Math.min(1, Math.max(0, t));
    // Coral → gold → mint, for dark text-on-ink (not cell fills).
    const stops = [
      [224, 118, 102],
      [212, 177, 90],
      [118, 204, 148],
    ];
    const pos = x * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(pos));
    const u = pos - i;
    const r = Math.round(stops[i][0] + (stops[i + 1][0] - stops[i][0]) * u);
    const g = Math.round(stops[i][1] + (stops[i + 1][1] - stops[i][1]) * u);
    const b = Math.round(stops[i][2] + (stops[i + 1][2] - stops[i][2]) * u);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function scale(values, value, invert) {
    const nums = values.filter((n) => Number.isFinite(n));
    if (!nums.length || !Number.isFinite(value)) return 0.5;
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    if (hi === lo) return 0.7;
    const t = (value - lo) / (hi - lo);
    return invert ? 1 - t : t;
  }

  function ageDays(iso) {
    if (!iso) return Infinity;
    const dt = new Date(iso.length <= 10 ? iso + "T12:00:00Z" : iso);
    if (Number.isNaN(dt.getTime())) return Infinity;
    return (Date.parse(data.generatedAt) - dt.getTime()) / 86400000;
  }

  function isEstablished(c) {
    return (
      c.wars >= filters.establishedMinWars &&
      c.uncertainty < filters.establishedMaxUncertainty &&
      ageDays(c.lastPlayed) <= filters.establishedMaxIdleDays
    );
  }

  function viewRows() {
    let rows = clans.filter((c) => c.wars >= filters.rankedMinWars);
    if (state.view === "established") {
      rows = rows.filter(isEstablished);
    }
    return rows;
  }

  function visibleRows() {
    const q = state.query.trim().toLowerCase();
    let rows = viewRows();
    if (q) {
      rows = rows.filter((c) => {
        const tag = (c.tag || "").toLowerCase();
        const name = (c.name || "").toLowerCase();
        return tag.includes(q) || name.includes(q);
      });
    }
    rows.sort((a, b) => {
      if (state.sort === "wars") {
        if (b.wars !== a.wars) return b.wars - a.wars;
      }
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (a.uncertainty !== b.uncertainty) return a.uncertainty - b.uncertainty;
      return b.wars - a.wars;
    });
    return rows;
  }

  function renderExplain() {
    if (!els.explain && !els.explainBoard) return;
    const ex = data.explain || {};
    const bits = [];
    const mf = ex.mf;
    if (mf && mf.marginDemo) {
      const d = mf.marginDemo;
      const fmt = (n) => `${n >= 0 ? "+" : ""}${Math.round(n)}`;
      bits.push(
        `<div class="ex-block">
          <h3>Same opponent, different score — ${esc(mf.tag)} vs ${esc(d.tag)}</h3>
          <ul class="ex-rows">
            <li><span>11–10</span><span class="ex-delta">${fmt(d.close)}</span></li>
            <li><span>12–4</span><span class="ex-delta">${fmt(d.solid)}</span></li>
            <li><span>12–0</span><span class="ex-delta">${fmt(d.stomp)}</span></li>
          </ul>
        </div>`
      );
    }
    if (mf && mf.beats && mf.beats.length) {
      const rows = mf.beats
        .map((b) => {
          const sign = b.delta >= 0 ? "+" : "";
          return `<li><span>vs ${esc(b.tag)} ~${Math.round(b.rating)}</span><span class="ex-delta">${sign}${Math.round(b.delta)}</span></li>`;
        })
        .join("");
      bits.push(
        `<div class="ex-block">
          <h3>Same 12–4, different opponent — ${esc(mf.tag)} (~${Math.round(mf.rating)}, ${mf.wars} wars)</h3>
          <ul class="ex-rows">${rows}</ul>
        </div>`
      );
    }
    if (els.explain) els.explain.innerHTML = bits.join("");

    const boardBits = [];
    const kol = ex.kol;
    const ie = ex.ie;
    if (kol && ie) {
      boardBits.push(
        `<div class="ex-block">
          <h3>Same win%, different schedule</h3>
          <ul class="ex-rows">
            <li><span><strong>${esc(kol.tag)}</strong> ${kol.winPct.toFixed(0)}% · Avg opp ~${Math.round(kol.avgOpp)}</span><span class="ex-result">mid</span></li>
            <li><span><strong>${esc(ie.tag)}</strong> ${ie.winPct.toFixed(0)}% · Avg opp ~${Math.round(ie.avgOpp)}</span><span class="ex-result">top</span></li>
          </ul>
        </div>`
      );
    }
    const fs = ex.forsaken;
    if (fs) {
      const label = fs.name && fs.name !== fs.tag ? `${esc(fs.name)} [${esc(fs.tag)}]` : esc(fs.tag);
      boardBits.push(
        `<div class="ex-block">
          <h3>Ignore this rank</h3>
          <p class="ex-note">${label}, ${fs.wins}–${fs.losses}${fs.draws ? "–" + fs.draws : ""} in ${fs.wars} wars. Uncertainty ~${Math.round(fs.uncertainty)}, Avg opp ~${Math.round(fs.avgOpp)} — still a guess.</p>
        </div>`
      );
    }
    if (els.explainBoard) els.explainBoard.innerHTML = boardBits.join("");
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function render() {
    const rows = visibleRows();
    const heatSet = viewRows();
    const ratings = heatSet.map((r) => r.rating);
    const uncs = heatSet.map((r) => r.uncertainty);
    const opps = heatSet.map((r) => r.avgOpp);
    const winps = heatSet.map((r) => r.winPct);
    const wars = heatSet.map((r) => r.wars);

    if (els.body) {
      els.body.innerHTML = rows
        .map((c, i) => {
          const lastHeat = Number.isFinite(ageDays(c.lastPlayed))
            ? 1 - Math.min(1, ageDays(c.lastPlayed) / 60)
            : 0;
          return `<tr>
            <td class="num">${i + 1}</td>
            <td class="clan"><span class="tag">${esc(c.tag || "—")}</span> <span class="name">${esc(c.name)}</span></td>
            <td class="num heat" style="color:${heatColor(scale(ratings, c.rating, false))}">${Math.round(c.rating)}</td>
            <td class="num heat" style="color:${heatColor(scale(uncs, c.uncertainty, true))}">${Math.round(c.uncertainty)}</td>
            <td class="num heat" style="color:${heatColor(scale(opps, c.avgOpp, false))}">${Math.round(c.avgOpp)}</td>
            <td class="num wld">${c.wins}–${c.losses}–${c.draws}</td>
            <td class="num heat" style="color:${heatColor(scale(winps, c.winPct, false))}">${c.winPct.toFixed(1)}%</td>
            <td class="num heat" style="color:${heatColor(scale(wars, c.wars, false))}">${c.wars}</td>
            <td class="num heat" style="color:${heatColor(lastHeat)}">${esc(fmtDay(c.lastPlayed))}</td>
          </tr>`;
        })
        .join("");
    }

    if (els.empty) {
      els.empty.hidden = rows.length > 0;
    }

    if (els.established && els.all) {
      els.established.setAttribute("aria-pressed", String(state.view === "established"));
      els.all.setAttribute("aria-pressed", String(state.view === "all"));
    }

    document.querySelectorAll("th.sortable").forEach((th) => {
      const key = th.getAttribute("data-sort");
      th.setAttribute("aria-sort", key === state.sort ? "descending" : "none");
    });

    if (els.sort) els.sort.value = state.sort;
  }

  if (els.updated) {
    els.updated.textContent = data.generatedAt ? fmtWhen(data.generatedAt) : "—";
  }
  if (els.counts) {
    const nEst = clans.filter(isEstablished).length;
    const nRanked = clans.filter((c) => c.wars >= filters.rankedMinWars).length;
    const used = data.counts?.used ?? "—";
    els.counts.textContent = `${used} wars · ${nEst} established · ${nRanked} ranked`;
  }

  els.established?.addEventListener("click", () => {
    state.view = "established";
    render();
  });
  els.all?.addEventListener("click", () => {
    state.view = "all";
    render();
  });
  els.search?.addEventListener("input", () => {
    state.query = els.search.value;
    render();
  });
  els.sort?.addEventListener("change", () => {
    state.sort = els.sort.value === "wars" ? "wars" : "rating";
    render();
  });
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      state.sort = th.getAttribute("data-sort") === "wars" ? "wars" : "rating";
      render();
    });
  });

  renderExplain();
  render();
})();
