(() => {
  const raw = document.getElementById("ladder-data");
  if (!raw) return;

  const data = JSON.parse(raw.textContent);
  const clans = data.clans || [];
  const filters = data.filters || {
    establishedMinWars: 15,
    establishedMaxUncertainty: 100,
    rankedMinWars: 5,
  };

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
  };

  function fmtWhen(iso) {
    if (!iso) return "—";
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso.slice(0, 10);
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(dt) + " UTC";
  }

  function fmtDay(iso) {
    if (!iso) return "—";
    const dt = new Date(iso.length <= 10 ? iso + "T00:00:00Z" : iso);
    if (Number.isNaN(dt.getTime())) return iso.slice(0, 10);
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(dt);
  }

  function heatColor(t) {
    const x = Math.min(1, Math.max(0, t));
    const r = Math.round(168 + (46 - 168) * x);
    const g = Math.round(52 + (140 - 52) * x);
    const b = Math.round(48 + (72 - 48) * x);
    return `rgba(${r}, ${g}, ${b}, 0.55)`;
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

  function viewRows() {
    let rows = clans.filter((c) => c.wars >= filters.rankedMinWars);
    if (state.view === "established") {
      rows = rows.filter(
        (c) =>
          c.wars >= filters.establishedMinWars &&
          c.uncertainty < filters.establishedMaxUncertainty
      );
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
    if (!els.explain) return;
    const ex = data.explain || {};
    const bits = [];
    const mf = ex.mf;
    if (mf && mf.beats && mf.beats.length) {
      const parts = mf.beats.map((b) => {
        const sign = b.delta >= 0 ? "+" : "";
        return `beating ${esc(b.tag)} (~${Math.round(b.rating)}) ≈ ${sign}${b.delta.toFixed(0)}`;
      });
      bits.push(
        `<p>Example: <strong>${esc(mf.tag)}</strong> (~${Math.round(mf.rating)}, ${mf.wars} wars) ${parts.join("; ")}.</p>`
      );
    }
    const kol = ex.kol;
    const ie = ex.ie;
    if (kol && ie) {
      bits.push(
        `<p><strong>${esc(kol.tag)}</strong>: ${kol.winPct.toFixed(0)}% win rate, ${kol.wars} wars, Avg opp ~${Math.round(kol.avgOpp)} → mid table.
        <strong>${esc(ie.tag)}</strong>: ${ie.winPct.toFixed(0)}% win rate, Avg opp ~${Math.round(ie.avgOpp)} → top of the board.
        Same win% idea, different schedule.</p>`
      );
    }
    const fs = ex.forsaken;
    if (fs) {
      const label = fs.name && fs.name !== fs.tag ? `${esc(fs.name)} [${esc(fs.tag)}]` : esc(fs.tag);
      bits.push(
        `<p><strong>${label}</strong> (${fs.wins}–${fs.losses}${fs.draws ? "–" + fs.draws : ""}, ${fs.wars} wars): Uncertainty ~${Math.round(fs.uncertainty)}, Avg opp ~${Math.round(fs.avgOpp)}. That rank is still a guess — ignore it until the sample is large and Uncertainty is low.</p>`
      );
    }
    els.explain.innerHTML = bits.join("");
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
            <td>${i + 1}</td>
            <td class="clan"><span class="tag">${esc(c.tag || "—")}</span> <span class="name">${esc(c.name)}</span></td>
            <td class="heat" style="background:${heatColor(scale(ratings, c.rating, false))}">${Math.round(c.rating)}</td>
            <td class="heat" style="background:${heatColor(scale(uncs, c.uncertainty, true))}">${Math.round(c.uncertainty)}</td>
            <td class="heat" style="background:${heatColor(scale(opps, c.avgOpp, false))}">${Math.round(c.avgOpp)}</td>
            <td class="wld">${c.wins}–${c.losses}–${c.draws}</td>
            <td class="heat" style="background:${heatColor(scale(winps, c.winPct, false))}">${c.winPct.toFixed(1)}%</td>
            <td class="heat" style="background:${heatColor(scale(wars, c.wars, false))}">${c.wars}</td>
            <td class="heat" style="background:${heatColor(lastHeat)}">${esc(fmtDay(c.lastPlayed))}</td>
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
    const nEst = clans.filter(
      (c) =>
        c.wars >= filters.establishedMinWars &&
        c.uncertainty < filters.establishedMaxUncertainty
    ).length;
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
