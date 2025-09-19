const clockEl = document.getElementById('clock');
const updatedEl = document.getElementById('updated');
const boardEl = document.getElementById('board');
const subtitleEl = document.getElementById('subtitle');

const API = '/api/changes';
const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

function fmtDate(d) {
  const dt = new Date(d);
  return dt.toLocaleString('en-US', {
    timeZone: 'America/Denver',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: '2-digit'
  });
}

function tickClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleString('en-US', {
    timeZone: 'America/Denver',
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
setInterval(tickClock, 1000);
tickClock();

async function load() {
  try {
    const r = await fetch(API);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const prepFrom = new Date(data.filters.prepFrom);
    const prepTo = new Date(data.filters.prepTo);

    // Compact subtitle formatting
    const prepFromStr = prepFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric'});
    const prepToStr = prepTo.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const eventDays = data.filters.eventDaysBack + 1;

    subtitleEl.textContent =
        `Showing changes made in the last ${eventDays} days ` +
        `to shows with prep dates between ${prepFromStr} – ${prepToStr}`;   
    updatedEl.textContent = `Updated ${fmtDate(data.asOf)}`;

    const entries = Object.entries(data.grouped)
      .sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) {
      boardEl.innerHTML = `<div class="loading">No changes in the current windows. Go forth and be calm.</div>`;
      return;
    }

    boardEl.innerHTML = entries.map(([show, rows]) => {
      rows.sort((a, b) =>
        (a.eventDate || '').localeCompare(b.eventDate || '')
      );

      const headerBadge = `<span class="badge">#${rows[0].orderId}</span>`;
      const body = rows.map(r => {
        // decide color class based on verb
        const verb = (r.verb || '').toLowerCase();
        const itemClass =
            verb === 'added' ? 'note-added' :
            (verb === 'updated' || verb === 'update' || verb === 'changed' || verb === 'change') ? 'note-changed' :
            verb === 'deleted' ? 'note-deleted' : '';

        return `
          <div class="row">
            <div class="item ${itemClass}">${escapeHtml(r.item)}</div>
            <div class="change">${escapeHtml(r.changeBy)}</div>
            <div class="time">${fmtDate(r.eventDate)}</div>
          </div>
        `;
      }).join('');

      return `
        <section class="group">
          <h2>${escapeHtml(show)} ${headerBadge}</h2>
          ${body}
        </section>
      `;
    }).join('');

  } catch (e) {
    console.error(e);
    boardEl.innerHTML = `<div class="loading">Error loading data: ${e.message}</div>`;
  }
}

function escapeHtml(s = '') {
  return s.replace(/[&<>"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[c]));
}

load();
setInterval(load, REFRESH_MS);