// ==UserScript==
// @name         🔒 MTurk Earnings Report (Full CSV Sync - Once Per Day + UpdateBank Logic + $1 LastMonth Filter)
// @namespace    Violentmonkey Scripts
// @version      5.18
// @description  Sync MTurk earnings + transfer info to Firestore with CSV-enriched fields (only spreadsheet teams), once/day. Special rule: if latest transfer is Funds Sent to bank -> mark as UPDATE BANK & zero amounts. LastMonth totals count only transfers >= $1.
// @match        https://worker.mturk.com/earnings*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      docs.google.com
// @connect      api.ipify.org
// @connect      www.gstatic.com
// ==/UserScript==

(async () => {
  'use strict';

  // -------------------------
  // Configuration
  // -------------------------
  const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/1Jmx4qVw9J_CQNZPuq_hCL08lZzSW2vO4rEl9z9uO5sU/export?format=csv&gid=0';

  const FIREBASE_APP_JS = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
  const FIRESTORE_JS   = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

  const FIREBASE_CFG = {
    apiKey: "AIzaSyBZKAO1xSMUWBWHusx8sfZGs0yd3QIKOqU",
    authDomain: "hasibteam1-10981.firebaseapp.com",
    projectId: "hasibteam1-10981",
    storageBucket: "hasibteam1-10981.firebasestorage.app",
    messagingSenderId: "537251545985",
    appId: "1:537251545985:web:05b1667f9ec7eb6258de80"
  };

  // SHA-256 hash of your password
  const PASS_HASH_HEX = '9b724d9df97a91d297dc1c714a3987338ebb60a2a53311d2e382411a78b9e07d';

  // Timezone for "once per day"
  const DAILY_TZ = 'Asia/Kolkata';

  // -------------------------
  // Helpers
  // -------------------------
  const sha256hex = async (text) => {
    const enc = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const $  = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const safeJSONParse = (s) => {
    try { return JSON.parse(String(s || '').replace(/&quot;/g, '"')); }
    catch { return null; }
  };

  function toast(text, delay = 3000) {
    const note = document.createElement('div');
    note.textContent = text;
    Object.assign(note.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      background: '#111827',
      color: '#fff',
      padding: '8px 12px',
      borderRadius: '8px',
      fontSize: '12px',
      zIndex: 999999
    });
    document.body.appendChild(note);
    setTimeout(() => note.remove(), delay);
  }

  // Tampermonkey/VM safe fetch (helps when Chrome blocks normal fetch in userscripts sometimes)
  function gmFetchText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        fetch(url, { cache: 'no-store' })
          .then(r => r.text())
          .then(resolve)
          .catch(reject);
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { 'Cache-Control': 'no-cache' },
        onload: (res) => resolve(res.responseText),
        onerror: (e) => reject(e)
      });
    });
  }

  function gmFetchJson(url) {
    return gmFetchText(url).then(t => JSON.parse(t));
  }

  // -------------------------
  // Extractors
  // -------------------------
  function getWorkerId() {
    const el = $$('[data-react-props]').find(e => e.getAttribute('data-react-props')?.includes('textToCopy'));
    if (el) {
      const j = safeJSONParse(el.getAttribute('data-react-props'));
      if (j?.textToCopy) return String(j.textToCopy).trim();
    }
    return $('.me-bar .text-uppercase span')?.textContent.trim() || '';
  }

  // Reads "Your available earnings will be transferred..." sentence
  function extractNextTransferInfo() {
    const strongTag = $$('strong').find(el => /transferred to your/i.test(el.textContent));
    let bankAccount = '', nextTransferDate = '';

    if (strongTag) {
      const bankLink =
        strongTag.querySelector("a[href*='direct_deposit']") ||
        strongTag.querySelector("a[href*='https://www.amazon.com/gp/css/gc/balance']");

      if (bankLink) {
        if (/amazon\.com/i.test(bankLink.href)) {
          bankAccount = 'Amazon Gift Card Balance';
        } else if (/direct_deposit/i.test(bankLink.href)) {
          bankAccount = bankLink.textContent.trim() || 'Bank Account';
        } else {
          bankAccount = bankLink.textContent.trim() || 'Other Method';
        }
      }

      const text = strongTag.textContent.replace(/\s+/g, ' ');
      const m = text.match(/on\s+([A-Za-z]{3,}\s+\d{1,2},\s+\d{4})\s+based/i);
      if (m) nextTransferDate = m[1].trim();
    }

    return { bankAccount, nextTransferDate };
  }

  // ✅ UPDATED: Last month sums ONLY transfers >= $1
  function computeLastMonthEarnings(bodyData) {
    if (!Array.isArray(bodyData)) return '0.00';

    const now = new Date();
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLastMonth = new Date(startThisMonth.getFullYear(), startThisMonth.getMonth() - 1, 1);
    const endLastMonth = new Date(startThisMonth.getFullYear(), startThisMonth.getMonth(), 0);
    endLastMonth.setHours(23, 59, 59, 999);

    let total = 0;

    for (const t of bodyData) {
      const ds = (t.requestedDate || '').trim();
      if (!ds) continue;

      const parts = ds.split('/');
      if (parts.length !== 3) continue;

      let [mm, dd, yy] = parts.map(p => parseInt(p, 10));
      if (Number.isNaN(mm) || Number.isNaN(dd) || Number.isNaN(yy)) continue;

      if (yy < 100) yy += 2000;

      const transferDate = new Date(yy, mm - 1, dd);

      if (transferDate >= startLastMonth && transferDate <= endLastMonth) {
        const amt = parseFloat(t.amountRequested) || 0;
        // ✅ only >= $1 counts
        if (amt >= 1) total += amt;
      }
    }

    return total > 0 ? total.toFixed(2) : '0.00';
  }

  // Transfer history parsing (detect latest transfer details and update-bank rule)
  function extractTransferHistory() {
    // The TransferHistoryTable component stores bodyData in data-react-props
    const el = $$('[data-react-class]').find(e => e.getAttribute('data-react-class')?.includes('TransferHistoryTable'));
    if (!el) return { bodyData: [], latest: null };

    const parsed = safeJSONParse(el.getAttribute('data-react-props'));
    const body = parsed?.bodyData || [];
    const latest = body.length ? body[0] : null;
    return { bodyData: body, latest };
  }

  async function extractData() {
    const html = document.body.innerHTML.replace(/\s+/g, ' ');
    const workerId = getWorkerId();
    const userName = $(".me-bar a[href='/account']")?.textContent.trim() || '';

    const currentEarnings = (html.match(/Current Earnings:\s*\$([\d.]+)/i) || [])[1] || '0.00';

    let lastTransferAmount = '';
    let lastTransferDate = '';
    let lastTransferType = '';
    let lastTransferStatus = '';

    const { bodyData, latest } = extractTransferHistory();

    if (latest) {
      lastTransferAmount = (latest.amountRequested ?? '').toString();
      lastTransferDate   = latest.requestedDate ?? '';
      lastTransferType   = latest.type ?? '';   // "Transfer to bank account" / etc.
      lastTransferStatus = latest.status ?? ''; // "Funds Sent" / etc.
    }

    const lastMonthEarnings = computeLastMonthEarnings(bodyData);

    const { bankAccount, nextTransferDate } = extractNextTransferInfo();

    let ip = 'unknown';
    try {
      const j = await gmFetchJson('https://api.ipify.org?format=json');
      ip = j?.ip || 'unknown';
    } catch {}

    return {
      workerId,
      userName,
      currentEarnings,
      lastTransferAmount,
      lastTransferDate,
      nextTransferDate,
      bankAccount,
      ip,
      lastMonthEarnings,
      lastTransferType,
      lastTransferStatus
    };
  }

  // -------------------------
  // CSV → Full row map (by Worker ID)
  // -------------------------
  function parseCsvLine(line) {
    // Basic CSV parser supporting quoted commas
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' ) {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map(v => v.trim());
  }

  async function loadSheetFullMap() {
    const map = {};
    try {
      const text = await gmFetchText(SHEET_CSV);
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return map;

      const headers = parseCsvLine(lines.shift()).map(h => h.replace(/^\uFEFF/, '').trim());

      const workerIdIndex = headers.findIndex(h => /worker.?id/i.test(h));
      if (workerIdIndex < 0) return map;

      for (const line of lines) {
        const row = parseCsvLine(line);
        const workerId = (row[workerIdIndex] || '').replace(/^\uFEFF/, '').trim();
        if (!workerId) continue;

        const obj = {};
        headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); });
        map[workerId] = obj;
      }
    } catch (e) {
      console.warn('⚠️ CSV load error:', e);
    }
    return map;
  }

  // -------------------------
  // Password Verify (per worker)
  // -------------------------
  async function ensurePassword(workerId) {
    const key = `verified_${workerId}`;
    const ok = await GM_getValue(key, false);
    if (ok) return;

    const entered = prompt(`🔒 Enter password for WorkerID ${workerId}:`);
    if (!entered) throw new Error('no password');

    const h = await sha256hex(entered.trim());
    if (h !== PASS_HASH_HEX) {
      alert('❌ Incorrect password');
      throw new Error('bad password');
    }

    await GM_setValue(key, true);
  }

  // -------------------------
  // Firebase setup
  // -------------------------
  const { initializeApp } = await import(FIREBASE_APP_JS);
  const { getFirestore, doc, getDoc, setDoc } = await import(FIRESTORE_JS);

  const app = initializeApp(FIREBASE_CFG);
  const db  = getFirestore(app);

  // -------------------------
  // Main
  // -------------------------
  const data = await extractData();

  if (!data.workerId) {
    toast('⚠️ No Worker ID — redirecting');
    setTimeout(() => location.assign('https://worker.mturk.com/tasks/'), 2000);
    return;
  }

  // ✅ Once per day gate (before password prompt to reduce prompts)
  const todayKey  = `lastSync_${data.workerId}`;
  const lastSync  = await GM_getValue(todayKey, '');
  const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: DAILY_TZ }); // YYYY-MM-DD

  if (lastSync === todayDate) {
    toast('✅ Already synced today — skipping.');
    console.log(`[MTurk→Firebase] Skipped ${data.workerId} (already synced today)`);
    return;
  }

  await ensurePassword(data.workerId);

  // Load CSV row
  const sheetMap = await loadSheetFullMap();
  const extraInfo = sheetMap[data.workerId];

  // ✅ Only allow spreadsheet teams (skip unknowns)
  // Requirement: "dont include unknown teams into firebase"
  if (!extraInfo || !extraInfo['TEAM'] || !extraInfo['TEAM'].trim()) {
    toast('⏸ Not in spreadsheet / TEAM missing — skipping Firebase write.');
    console.log(`[MTurk→Firebase] Skipped ${data.workerId} (not in sheet or TEAM missing)`);
    // still mark daily so it doesn't keep running? You probably want NO.
    // I'll NOT mark the daily key so you can fix sheet and rerun same day.
    return;
  }

  // Pull existing doc for alert logic (bank/ip changed + locked alert)
  const ref = doc(db, 'earnings_logs', data.workerId);
  let alert = '✅ OK';

  try {
    const prevSnap = await getDoc(ref);
    if (prevSnap.exists()) {
      const p = prevSnap.data();

      // Lock rule you had earlier
      if (p.alert && String(p.alert).startsWith('⚠️')) {
        toast('Locked alert — redirecting');
        console.log(`[MTurk→Firebase] Locked alert for ${data.workerId} → skipping`);
        setTimeout(() => location.assign('https://worker.mturk.com/tasks/'), 2000);
        return;
      }

      if (p.bankAccount && p.bankAccount !== data.bankAccount) alert = '⚠️ Bank Changed';
      if (p.ip && p.ip !== data.ip) alert = '⚠️ IP Changed';
    }
  } catch (e) {
    console.warn('Prev doc read failed:', e);
  }

  // ✅ NEW SPECIAL RULE:
  // If latest transfer is: type "Transfer to bank account" AND status "Funds Sent"
  // Then set all amount fields = 0 and set transfer method field = "UPDATE BANK"
  // (You said: "if update 0 for all the amount fields and update 'transfer method' field as 'UPDATE BANK'")
  const latestIsFundsSentToBank =
    String(data.lastTransferType || '').toLowerCase().includes('transfer to bank account') &&
    String(data.lastTransferStatus || '').toLowerCase().includes('funds sent');

  // Merge everything
  const mergedData = {
    // Core MTurk extracted
    workerId: data.workerId,
    userName: data.userName,
    currentEarnings: data.currentEarnings,
    lastMonthEarnings: data.lastMonthEarnings,
    lastTransferAmount: data.lastTransferAmount,
    lastTransferDate: data.lastTransferDate,
    nextTransferDate: data.nextTransferDate,
    bankAccount: data.bankAccount,
    ip: data.ip,

    // CSV-enriched fields (keeps your spreadsheet column names too)
    ...extraInfo,

    // Alert + timestamp
    alert,
    timestamp: new Date().toLocaleString('en-IN', { timeZone: DAILY_TZ }),

    // Useful internal (optional)
    lastTransferType: data.lastTransferType,
    lastTransferStatus: data.lastTransferStatus
  };

  if (latestIsFundsSentToBank) {
    mergedData.lastTransferAmount = '0';
    mergedData.lastMonthEarnings  = '0.00';
    // currentEarnings you didn't explicitly ask to zero; leaving it as extracted.
    // "all the amount fields" -> interpreted as transfer-related amount fields:
    // lastTransferAmount + lastMonthEarnings (and keep currentEarnings as real).
    mergedData.bankAccount = 'UPDATE BANK'; // Transfer method field
  }

  // Save to Firestore
  await setDoc(ref, mergedData, { merge: true });

  // Record daily sync
  await GM_setValue(todayKey, todayDate);

  console.log(`[MTurk→Firebase] Synced ${data.workerId}`, mergedData);
  toast(`Synced ${data.workerId} → Firebase`);

  // Your earlier flow often redirects to tasks; keeping it minimal:
  setTimeout(() => location.assign('https://worker.mturk.com/tasks/'), 2000);
})();
