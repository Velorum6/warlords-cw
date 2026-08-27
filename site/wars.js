(() => {
  const raw = document.getElementById("wars-data");
  if (!raw) return;

  const data = JSON.parse(raw.textContent);
  const wars = data.wars || [];

  const els = {
    updated: document.getElementById("last-updated"),
    counts: document.getElementById("war-counts"),
    search: document.getElementById("search"),
    list: document.getElementById("war-list"),
    empty: document.getElementById("war-empty"),
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

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

  function fmtStamp(iso) {
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
    }).format(dt);
  }

  function clanLabel(c) {
    const tag = c?.tag || "—";
    const name = c?.name || "";
    return `<span class="tag">${esc(tag)}</span> ${esc(name)}`;
  }

  function matchesQuery(w, q) {
    if (!q) return true;
    const text = (c) => `${c?.tag || ""} ${c?.name || ""}`.toLowerCase();
    const c1 = text(w.clan1);
    const c2 = text(w.clan2);
    const parts = q.split(/\s+vs\.?\s+/);
    if (parts.length === 2 && parts[0] && parts[1]) {
      const a = parts[0].trim();
      const b = parts[1].trim();
      return (c1.includes(a) && c2.includes(b)) || (c1.includes(b) && c2.includes(a));
    }
    return `${c1} ${c2}`.includes(q);
  }

  function render() {
    const q = (els.search?.value || "").trim().toLowerCase();
    const rows = wars.filter((w) => matchesQuery(w, q));
    if (els.list) {
      els.list.innerHTML = rows
        .map((w) => {
          const w1 = w.s1 > w.s2;
          const w2 = w.s2 > w.s1;
          const c1 = w1 ? " win" : w2 ? " lose" : "";
          const c2 = w2 ? " win" : w1 ? " lose" : "";
          return `<li>
            <span class="when">${esc(fmtStamp(w.when))}</span>
            <span class="match">
              <span class="side${c1}">${clanLabel(w.clan1)}</span>
              <span class="vs">vs</span>
              <span class="side${c2}">${clanLabel(w.clan2)}</span>
            </span>
            <span class="score">${w.s1}–${w.s2}</span>
          </li>`;
        })
        .join("");
    }
    if (els.empty) els.empty.hidden = rows.length > 0;
    if (els.counts) {
      els.counts.textContent = q
        ? `${rows.length} of ${wars.length} wars`
        : `${wars.length} published wars`;
    }
  }

  if (els.updated) {
    els.updated.textContent = data.generatedAt ? fmtWhen(data.generatedAt) : "—";
  }
  els.search?.addEventListener("input", render);
  render();
})();
