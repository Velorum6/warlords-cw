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
      timeZone: "UTC",
    }).format(dt);
  }

  function clanLabel(c) {
    const tag = c?.tag || "—";
    const name = c?.name || "";
    return `<span class="tag">${esc(tag)}</span> ${esc(name)}`;
  }

  function matchesQuery(w, q) {
    if (!q) return true;
    const blob = `${w.clan1?.tag || ""} ${w.clan1?.name || ""} ${w.clan2?.tag || ""} ${w.clan2?.name || ""}`.toLowerCase();
    return blob.includes(q);
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
