// API接続先は同一オリジン（Next.jsが配信）。
const BASE = '';

function headers(extra = {}) {
  const pw = typeof localStorage !== 'undefined' ? localStorage.getItem('appPassword') : null;
  return { ...extra, ...(pw ? { 'x-app-password': pw } : {}) };
}

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.note || body.error || `HTTP ${res.status}`);
    err.code = body.error;
    throw err;
  }
  return res.json();
}

async function download(path, fallbackName) {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename="?([^"]+)"?/);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = m ? m[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  listContacts: (status) =>
    fetch(`${BASE}/api/contacts${status ? `?status=${encodeURIComponent(status)}` : ''}`, { headers: headers() }).then(handle),

  summary: () => fetch(`${BASE}/api/contacts/summary`, { headers: headers() }).then(handle),

  updateContact: (id, fields) =>
    fetch(`${BASE}/api/contacts/${id}`, {
      method: 'PATCH',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(fields),
    }).then(handle),

  createContact: (fields) =>
    fetch(`${BASE}/api/contacts`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(fields),
    }).then(handle),

  deleteContact: async (id) => {
    const res = await fetch(`${BASE}/api/contacts/${id}`, { method: 'DELETE', headers: headers() });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
  },

  // commit=false: プレビュー / true: 確定保存。mapping={company,person,phone,memo: 列index|null}
  importExcel: (file, commit, mapping) => {
    const fd = new FormData();
    fd.append('file', file);
    if (mapping) fd.append('mapping', JSON.stringify(mapping));
    return fetch(`${BASE}/api/contacts/import?commit=${commit}`, { method: 'POST', headers: headers(), body: fd }).then(handle);
  },

  // 正規化済みレコードを一括投入（ブラウザ解析→分割送信）
  importChunk: (records) =>
    fetch(`${BASE}/api/contacts/import/chunk`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ records }),
    }).then(handle),

  listCalls: () => fetch(`${BASE}/api/calls`, { headers: headers() }).then(handle),

  createCall: (call) =>
    fetch(`${BASE}/api/calls`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(call),
    }).then(handle),

  manualToken: () => fetch(`${BASE}/api/calls/manual/token`, { method: 'POST', headers: headers() }).then(handle),

  startAiCall: (contact_id) =>
    fetch(`${BASE}/api/calls/ai`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ contact_id }),
    }).then(handle),

  getCall: (id) => fetch(`${BASE}/api/calls/${id}`, { headers: headers() }).then(handle),

  listScripts: () => fetch(`${BASE}/api/scripts`, { headers: headers() }).then(handle),

  saveScript: (script) =>
    fetch(`${BASE}/api/scripts`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(script),
    }).then(handle),

  listIndustryPitches: () => fetch(`${BASE}/api/industry-pitches`, { headers: headers() }).then(handle),
  createIndustryPitch: (p) =>
    fetch(`${BASE}/api/industry-pitches`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(p),
    }).then(handle),
  updateIndustryPitch: (id, p) =>
    fetch(`${BASE}/api/industry-pitches/${id}`, {
      method: 'PATCH',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(p),
    }).then(handle),
  deleteIndustryPitch: async (id) => {
    const res = await fetch(`${BASE}/api/industry-pitches/${id}`, { method: 'DELETE', headers: headers() });
    if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
  },

  getSettings: () => fetch(`${BASE}/api/settings`, { headers: headers() }).then(handle),
  saveSettings: (s) =>
    fetch(`${BASE}/api/settings`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(s),
    }).then(handle),

  exportContacts: () => download('/api/contacts/export', 'contacts.xlsx'),
  exportCalls: () => download('/api/calls/export', 'calls.xlsx'),
};
