/* server/server.js */
import 'dotenv/config';
import express from 'express';
import {
  dashboardFilterIds,
  loadDashboardSettings,
  saveDashboardSettings,
  SETTING_LIMITS,
  SETTING_OPTIONS,
  validateDashboardSettings
} from './dashboardSettings.js';
import { extractItemFromNote } from './noteParser.js';

const app = express();
app.use(express.json());

const BASE = process.env.IE_API_BASE || 'https://webapi2ui.ielightning.net';
const WEBB_TOKEN_URL = process.env.WEBB_TOKEN_URL || 'https://api.wearewebb.com/token';
const WEBB_TOKEN_BEARER = process.env.WEBB_TOKEN_BEARER || '';
const WEBB_TOKEN_REFRESH_BUFFER_MS = Number(process.env.WEBB_TOKEN_REFRESH_BUFFER_MS || 5 * 60 * 1000);
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 5050);
let dashboardSettings = await loadDashboardSettings();

function iso(d) { return new Date(d).toISOString(); }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

let cachedIeToken = null;
let tokenFetchPromise = null;

function makeError(message, status = 500) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function bearerHeaderValue(token) {
  const value = String(token || '').trim();
  if (!value) return '';
  return /^Bearer\s+/i.test(value) ? value : `Bearer ${value}`;
}

function tokenIsFresh(token) {
  if (!token?.expiresAt) return false;
  return token.expiresAt - WEBB_TOKEN_REFRESH_BUFFER_MS > Date.now();
}

async function fetchIeTokenFromWebb() {
  if (!WEBB_TOKEN_BEARER) {
    throw makeError('WEBB_TOKEN_BEARER is required to fetch the IE access token.');
  }

  const r = await fetch(WEBB_TOKEN_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: bearerHeaderValue(WEBB_TOKEN_BEARER)
    }
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw makeError(`WEBB token API ${r.status} ${r.statusText} - ${txt.slice(0, 200)}`, 502);
  }

  const data = await r.json().catch(() => {
    throw makeError('WEBB token API returned invalid JSON.', 502);
  });

  if (data.failed) {
    throw makeError(`WEBB token API failed: ${data.failed}`, 502);
  }
  if (!data.accessToken) {
    throw makeError('WEBB token API response did not include accessToken.', 502);
  }

  const expiresAt = Date.parse(data.expirationDate || '');
  cachedIeToken = {
    accessToken: data.accessToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0
  };

  if (!cachedIeToken.expiresAt) {
    console.warn('WEBB token API response did not include a valid expirationDate; token will not be cached.');
  }

  return cachedIeToken;
}

async function getIeAuthorizationHeader() {
  if (tokenIsFresh(cachedIeToken)) {
    return bearerHeaderValue(cachedIeToken.accessToken);
  }

  tokenFetchPromise ||= fetchIeTokenFromWebb().finally(() => {
    tokenFetchPromise = null;
  });

  const token = await tokenFetchPromise;
  return bearerHeaderValue(token.accessToken);
}

// --- Fetch one page from IE ---
async function fetchChangeLogPage(pageNumber, eventFrom, eventTo, prepFrom, prepTo, settings) {
  const url = `${BASE}/api/v1/Reports/General/GlobalChangeLogReport/List`;
  const filterIds = dashboardFilterIds(settings);

  const filterItems = [
    {
      id: -2147483648,
      fieldId: 'event_date',
      condition: 2, // Between
      criteria1: iso(eventFrom),
      negate: false,
      criteria2: iso(eventTo)
    },
    { id: -2147483648, fieldId: '_ChangeType', condition: 0, criteria1: '2' }
  ];

  if (filterIds.officeIds.length) {
    filterItems.push({
      id: -2147483648, fieldId: 'office_id', condition: 0, criteria1: filterIds.officeIds.join(',')
    });
  }
  if (filterIds.jobTypeIds.length) {
    filterItems.push({
      id: -2147483648, fieldId: 'job_type_id', condition: 0, criteria1: filterIds.jobTypeIds.join(',')
    });
  }

  filterItems.push({
    id: -2147483648, fieldId: 'begin_date1', condition: 2,
    criteria1: iso(prepFrom), negate: false, criteria2: iso(prepTo)
  });

  const body = {
    pageNumber,
    sortField: '',
    sortAscending: true,
    groupSortField: [],
    groupSortAscending: true,
    filterItems,
    displayedProperties: [
      'OrderId', 'JobType', 'BeginDate1', 'BeginDate3_5', 'ChangeBy', 'EventDate',
      'Note', 'ClientName', 'JobTotal', 'BalanceDue'
    ],
    recordCountPerPage: settings.pageSize
  };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: await getIeAuthorizationHeader()
  };

  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    const err = new Error(`IE API ${r.status} ${r.statusText} – ${txt.slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

app.get('/api/settings', (req, res) => {
  res.json({
    settings: dashboardSettings,
    options: SETTING_OPTIONS,
    limits: SETTING_LIMITS
  });
});

app.put('/api/settings', async (req, res) => {
  try {
    const nextSettings = validateDashboardSettings(req.body, dashboardSettings);
    await saveDashboardSettings(nextSettings);
    dashboardSettings = nextSettings;

    res.json({
      settings: dashboardSettings,
      options: SETTING_OPTIONS,
      limits: SETTING_LIMITS
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Invalid settings' });
  }
});

// --- Main API: processed list based on your window rules ---
app.get('/api/changes', async (req, res) => {
  try {
    const settings = structuredClone(dashboardSettings);
    const now = startOfDay(new Date());
    const eventFrom = addDays(now, -settings.eventDaysBack);
    const eventTo = endOfDay(now);
    const prepFrom = addDays(startOfDay(now), -settings.prepDaysPast);
    const prepTo = addDays(startOfDay(now), settings.prepDaysFuture);

    // Paginate through IE API
    let page = 1;
    let totalPages = 1;
    const all = [];
    do {
      const data = await fetchChangeLogPage(page, eventFrom, eventTo, prepFrom, prepTo, settings);
      totalPages = data.totalPageCount || 1;
      (data.items || []).forEach(it => all.push(it));
      page += 1;
    } while (page <= totalPages);

    // Only drop unwanted notes ("labor", "price")
    const filtered = all.filter(v => {
      const note = (v.note || '').toLowerCase();
      if (/(^labor\b|labor\b|labor\s*[-:])/i.test(note)) return false;
      if (/(^price\b|price\b|price\s*[-:])/i.test(note)) return false;
      return true;
    });

    const display = filtered.map(v => {
      const { verb, item } = extractItemFromNote(v.note);
      const show = v.orgName || v.clientName || `Job ${v.orderId}`;
      return {
        show,
        orderId: v.orderId,
        item,
        verb,
        changeBy: v.changeBy,
        eventDate: v.eventDate,
        note: v.note,
        prepDate: v.beginDate1,
        returnDate: v.beginDate3_5
      };
    });

    const grouped = {};
    for (const d of display) {
      (grouped[d.show] ||= []).push(d);
    }

    res.json({
        asOf: new Date().toISOString(),
        count: display.length,
        grouped,
        filters: {
            eventDaysBack: settings.eventDaysBack,
            prepFrom: prepFrom.toISOString(),
            prepTo: prepTo.toISOString()
        },
        settings
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  }
});

app.use(express.static('public')); // serve the dashboard

const server = app.listen(PORT, HOST, () => {
  console.log(`Dashboard running on http://${HOST}:${PORT}`);
});

server.on('error', err => {
  console.error(err);
  process.exitCode = 1;
});
