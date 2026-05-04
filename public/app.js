const clockEl = document.getElementById('clock');
const updatedEl = document.getElementById('updated');
const boardEl = document.getElementById('board');
const subtitleEl = document.getElementById('subtitle');

const API = '/api/changes';
const DEFAULT_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
let refreshMs = DEFAULT_REFRESH_MS;
let refreshTimeoutId = null;
let autoScrollCleanups = [];

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
    updateRefreshMs(data.settings?.refreshSeconds);

    const prepFrom = new Date(data.filters.prepFrom);
    const prepTo = new Date(data.filters.prepTo);

    const prepFromStr = prepFrom.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const prepToStr = prepTo.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const eventDays = data.filters.eventDaysBack + 1;
    subtitleEl.textContent =
      `Showing changes made in the last ${eventDays} days ` +
      `to shows with prep dates between ${prepFromStr} – ${prepToStr}`;

    updatedEl.textContent = `Updated ${fmtDate(data.asOf)}`;

    const entries = Object.entries(data.grouped)
      .sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) {
      resetAutoScroll();
      boardEl.innerHTML = `<div class="loading">No changes in the current windows. Go forth and be calm.</div>`;
      return;
    }

    resetAutoScroll();
    boardEl.innerHTML = `
      <div class="grid-board">
        ${entries.map(([show, rows]) => {
          rows.sort((a, b) =>
            (a.eventDate || '').localeCompare(b.eventDate || '')
          );

          const headerBadge = `<span class="badge">#${rows[0].orderId}</span>`;
          const body = rows.map(r => {
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
            <div class="grid-card">
                <h2>${escapeHtml(show)} ${headerBadge}</h2>
                <div class="card-body">
                ${body}
                </div>
            </div>
        `;
        }).join('')}
      </div>
    `;

    // Apply auto-scroll to all cards
    autoScrollCleanups = Array.from(document.querySelectorAll('.grid-card'), autoScrollCard);

  } catch (e) {
    console.error(e);
    resetAutoScroll();
    boardEl.innerHTML = `<div class="loading">Error loading data: ${e.message}</div>`;
  } finally {
    scheduleNextLoad();
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

function resetAutoScroll() {
  autoScrollCleanups.forEach(cleanup => cleanup());
  autoScrollCleanups = [];
}

function updateRefreshMs(refreshSeconds) {
  const nextRefreshMs = Number(refreshSeconds) * 1000;
  if (Number.isFinite(nextRefreshMs) && nextRefreshMs >= 30000) {
    refreshMs = nextRefreshMs;
  }
}

function scheduleNextLoad() {
  clearTimeout(refreshTimeoutId);
  refreshTimeoutId = setTimeout(load, refreshMs);
}

// Auto-scroll function with bounce + pause
function autoScrollCard(card) {
  const body = card.querySelector('.card-body');
  if (!body || body.scrollHeight <= body.clientHeight) return () => {};

  let direction = 1;
  const speed = 0.4;
  let paused = false;
  let stopped = false;
  let pauseTimeoutId = null;
  let animationFrameId = null;

  function pauseScroll() {
    paused = true;
    pauseTimeoutId = setTimeout(() => { paused = false; }, 2000);
  }

  function tick() {
    if (stopped) return;

    if (!paused) {
      body.scrollTop += speed * direction;

      if (body.scrollTop + body.clientHeight >= body.scrollHeight) {
        direction = -1;
        pauseScroll();
      } else if (body.scrollTop <= 0) {
        direction = 1;
        pauseScroll();
      }
    }
    animationFrameId = requestAnimationFrame(tick);
  }

  animationFrameId = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(animationFrameId);
    clearTimeout(pauseTimeoutId);
  };
}

load();
