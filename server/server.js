/* server/server.js */
import 'dotenv/config';
import express from 'express';

const app = express();
app.use(express.json());

// Simple CORS for local dev
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // TV only, not public
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

const BASE = process.env.IE_API_BASE || 'https://webapi2ui.ielightning.net';
const PORT = Number(process.env.PORT || 5050);
const OFFICE_IDS = (process.env.OFFICE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const JOB_TYPE_IDS = (process.env.JOB_TYPE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 500);

const EVENT_DAYS_BACK = Number(process.env.EVENT_DAYS_BACK || 45);
const PREP_DAYS_PAST = Number(process.env.PREP_DAYS_PAST || 30);
const PREP_DAYS_FUTURE = Number(process.env.PREP_DAYS_FUTURE || 60);

function iso(d) { return new Date(d).toISOString(); }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// --- Heuristics for item + verb from the note ---
function extractItemFromNote(note = '') {
  const text = String(note || '').trim();

  // 1) Prefer verbs at the start (after optional prefixes like "Product Update:" or "Product Copy:")
  const m = text.match(
    /^(?:Product\s+(?:Update|Copy)\s*:\s*)?\s*(Added?|Deleted?|Updated?|Changed?|Add|Delete|Update|Change)\s*:?\s*(.+)$/i
  );
  if (m) {
    let verb = m[1].toLowerCase();
    // normalize to the forms your CSS expects
    if (verb.startsWith('add')) verb = 'added';
    else if (verb.startsWith('delete')) verb = 'deleted';
    else if (verb.startsWith('update')) verb = 'updated';
    else if (verb.startsWith('change')) verb = 'changed';
    return { verb, item: m[2].trim() };
  }

  // 2) Fallback: if a verb appears anywhere in the text, still set a verb so it can colorize
  const anywhere = text.match(/\b(added?|deleted?|updated?|changed?)\b/i);
  if (anywhere) {
    let verb = anywhere[1].toLowerCase();
    if (verb.startsWith('add')) verb = 'added';
    else if (verb.startsWith('delete')) verb = 'deleted';
    else if (verb.startsWith('update')) verb = 'updated';
    else if (verb.startsWith('change')) verb = 'changed';
    return { verb, item: text };
  }

  // 3) Nothing matched: return raw text, no verb (renders neutral)
  return { verb: null, item: text };
}

// --- Fetch one page from IE ---
async function fetchChangeLogPage(pageNumber, eventFrom, eventTo, prepFrom, prepTo) {
  const url = `${BASE}/api/v1/Reports/General/GlobalChangeLogReport/List`;

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

  if (OFFICE_IDS.length) {
    filterItems.push({
      id: -2147483648, fieldId: 'office_id', condition: 0, criteria1: OFFICE_IDS.join(',')
    });
  }
  if (JOB_TYPE_IDS.length) {
    filterItems.push({
      id: -2147483648, fieldId: 'job_type_id', condition: 0, criteria1: JOB_TYPE_IDS.join(',')
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
    recordCountPerPage: PAGE_SIZE
  };

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.AUTH_BEARER) headers['Authorization'] = process.env.AUTH_BEARER;
  if (process.env.AUTH_COOKIE) headers['Cookie'] = process.env.AUTH_COOKIE;

  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    const err = new Error(`IE API ${r.status} ${r.statusText} – ${txt.slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

// --- Main API: processed list based on your window rules ---
app.get('/api/changes', async (req, res) => {
  try {
    const now = startOfDay(new Date());
    const eventFrom = addDays(now, -EVENT_DAYS_BACK);
    const eventTo = endOfDay(now);
    const prepFrom = addDays(startOfDay(now), -PREP_DAYS_PAST);
    const prepTo = addDays(startOfDay(now), PREP_DAYS_FUTURE);

    // Paginate through IE API
    let page = 1;
    let totalPages = 1;
    const all = [];
    do {
      const data = await fetchChangeLogPage(page, eventFrom, eventTo, prepFrom, prepTo);
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

    console.log('Sample row:', display[0]);

    res.json({
        asOf: new Date().toISOString(),
        count: display.length,
        grouped,
        filters: {
            eventDaysBack: EVENT_DAYS_BACK,
            prepFrom: prepFrom.toISOString(),
            prepTo: prepTo.toISOString()
        }
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  }
});

app.use(express.static('public')); // serve the dashboard

app.listen(PORT, () => {
  console.log(`Dashboard running on http://localhost:${PORT}`);
});