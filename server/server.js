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
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }

// --- Heuristics for Set / Dept / Item (refine later if IE exposes real fields) ---
function extractItemFromNote(note = '') {
  // Try to capture product name after "Added"/"Delete"/"Updated"/"Product Update"
  const m = note.match(/(?:Product Update:\s*)?(?:Added|Delete|Updated|Change(?:d)?):?\s*(.+?)(?:[.,]|$)/i);
  return m ? m[1].trim() : note;
}
function inferDepartment(note = '') {
  const n = note.toLowerCase();
  if (/(hdmi|sdvoe|matrix|router|switcher|ndi|led wall|projector|camera|video)/.test(n)) return 'Video';
  if (/(mic|console|speaker|line array|audio|dsp|smaart)/.test(n)) return 'Audio';
  if (/(dmx|par|ellipsoidal|fixture|moving light|dimmer|lighting)/.test(n)) return 'Lighting';
  if (/(deck|scenic|drape|truss|rigging|set)/.test(n)) return 'Scenic';
  return 'General';
}
function inferSetName(note = '') {
  // Optional: look for "Set: <name>"
  const m = note.match(/\bset:\s*([^.,\n]+)/i);
  return m ? m[1].trim() : '';
}

// --- Fetch one page from IE ---
async function fetchChangeLogPage(pageNumber, eventFrom, prepFrom, prepTo) {
  const url = `${BASE}/api/v1/Reports/General/GlobalChangeLogReport/List`;

  const filterItems = [
    // event_date: After eventFrom
    { id: -2147483648, fieldId: 'event_date', condition: 0, criteria1: iso(eventFrom) },
    // ChangeType: Inventory (2)
    { id: -2147483648, fieldId: '_ChangeType', condition: 0, criteria1: '2' },
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
  // Limit prep date window for performance (Between)
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
      'OrderId','JobType','BeginDate1','BeginDate3_5','ChangeBy','EventDate','Note','ClientName','JobTotal','BalanceDue'
    ],
    recordCountPerPage: PAGE_SIZE
  };

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.AUTH_BEARER) headers['Authorization'] = process.env.AUTH_BEARER;
  if (process.env.AUTH_COOKIE) headers['Cookie'] = process.env.AUTH_COOKIE;

  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const txt = await r.text().catch(()=> '');
    const err = new Error(`IE API ${r.status} ${r.statusText} – ${txt.slice(0,200)}`);
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
    const prepFrom = addDays(now, -PREP_DAYS_PAST);
    const prepTo = addDays(now, PREP_DAYS_FUTURE);

    // Paginate
    let page = 1;
    let totalPages = 1;
    const all = [];
    do {
      const data = await fetchChangeLogPage(page, eventFrom, prepFrom, prepTo);
      totalPages = data.totalPageCount || 1;
      (data.items || []).forEach(it => all.push(it));
      page += 1;
    } while (page <= totalPages);

    // Apply your exact visibility rules client-side:
    // Show an item if "today" ∈ [prep - 3, return] AND eventDate >= (prep - 3)
    const visible = all.filter(row => {
      const prep = row.beginDate1 ? new Date(row.beginDate1) : null;
      const ret = row.beginDate3_5 ? new Date(row.beginDate3_5) : null;
      const eventAt = row.eventDate ? new Date(row.eventDate) : null;
      if (!prep || !eventAt || !ret) return false;

      const prepMinus3 = addDays(startOfDay(prep), -3);
      const today = now;

      const todayInWindow = today >= prepMinus3 && today <= ret;
      const changedSince = eventAt >= prepMinus3;

      return todayInWindow && changedSince;
    });

    // Map to display model
    const display = visible.map(v => {
      const show = v.orgName || v.clientName || `Job ${v.orderId}`;
      const setName = inferSetName(v.note);
      const department = inferDepartment(v.note);
      const item = extractItemFromNote(v.note);
      return {
        show,
        orderId: v.orderId,
        item,
        changeBy: v.changeBy,
        eventDate: v.eventDate,
        note: v.note,
        prepDate: v.beginDate1,
        returnDate: v.beginDate3_5
      };
    });

    // Group by show for convenience (front-end can ignore/group again if desired)
    const grouped = {};
    for (const d of display) {
      (grouped[d.show] ||= []).push(d);
    }

    res.json({
      asOf: new Date().toISOString(),
      count: display.length,
      grouped
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