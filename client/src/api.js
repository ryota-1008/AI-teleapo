// API接続先は .env から読む (DESIGN 13-1)。ハードコードしない。
const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

// 認証ONのときは localStorage のパスワードを送る (DESIGN 13-3)
function headers(extra = {}) {
  const pw = localStorage.getItem('appPassword');
  return { ...extra, ...(pw ? { 'x-app-password': pw } : {}) };
}

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // note(日本語の説明)があれば優先。無ければ error コード。
    const err = new Error(body.note || body.error || `HTTP ${res.status}`);
    err.code = body.error;
    throw err;
  }
  return res.json();
}

// Excelなどのファイルを取得してブラウザのダウンロードを起動する
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
    fetch(`${BASE}/api/contacts${status ? `?status=${encodeURIComponent(status)}` : ''}`, {
      headers: headers(),
    }).then(handle),

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
    return fetch(`${BASE}/api/contacts/import?commit=${commit}`, {
      method: 'POST',
      headers: headers(),
      body: fd,
    }).then(handle);
  },

  listCalls: () => fetch(`${BASE}/api/calls`, { headers: headers() }).then(handle),

  // 架電結果を記録(手動スマホ発信／ブラウザ発信どちらも)
  createCall: (call) =>
    fetch(`${BASE}/api/calls`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(call),
    }).then(handle),

  // ブラウザ発信用Twilioトークン。未設定時は503 {error:'twilio_not_configured'}
  manualToken: () =>
    fetch(`${BASE}/api/calls/manual/token`, { method: 'POST', headers: headers() }).then(handle),

  // AI発信。未設定時は503 {error:'elevenlabs_not_configured'}
  startAiCall: (contact_id) =>
    fetch(`${BASE}/api/calls/ai`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ contact_id }),
    }).then(handle),

  // 1件取得(AIモニターのポーリング用)
  getCall: (id) => fetch(`${BASE}/api/calls/${id}`, { headers: headers() }).then(handle),

  listScripts: () => fetch(`${BASE}/api/scripts`, { headers: headers() }).then(handle),

  // id があれば更新、なければ新規作成
  saveScript: (script) =>
    fetch(`${BASE}/api/scripts`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(script),
    }).then(handle),

  // Excelエクスポート(ブラウザダウンロード)
  exportContacts: () => download('/api/contacts/export', 'contacts.xlsx'),
  exportCalls: () => download('/api/calls/export', 'calls.xlsx'),

  getSettings: () => fetch(`${BASE}/api/settings`, { headers: headers() }).then(handle),
  saveSettings: (s) =>
    fetch(`${BASE}/api/settings`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(s),
    }).then(handle),
};
