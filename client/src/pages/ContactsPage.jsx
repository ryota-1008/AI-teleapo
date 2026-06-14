import { useEffect, useState } from 'react';
import { api } from '../api.js';
import CallModal from '../components/CallModal.jsx';
import AiCallModal from '../components/AiCallModal.jsx';

const STATUSES = ['未架電', '不在', 'アポ獲得', 'NG', '再架電'];

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [summary, setSummary] = useState([]);
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState(null); // 取込プレビュー
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [callContact, setCallContact] = useState(null); // 手動通話モーダル対象
  const [aiContact, setAiContact] = useState(null);      // AI発信モーダル対象
  const [activeScript, setActiveScript] = useState(null);

  async function load() {
    try {
      const [c, s] = await Promise.all([api.listContacts(filter), api.summary()]);
      setContacts(c);
      setSummary(s);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [filter]); // eslint-disable-line

  // 使用中のトークスクリプトを取得(通話画面に表示する用)
  useEffect(() => {
    api.listScripts()
      .then((list) => setActiveScript(list.find((s) => s.is_active) || null))
      .catch(() => setActiveScript(null));
  }, []);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.importExcel(file, false); // まずプレビュー
      setPreview({ file, ...result });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    setBusy(true);
    try {
      await api.importExcel(preview.file, true);
      setPreview(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id, status) {
    await api.updateContact(id, { status });
    await load();
  }

  return (
    <div className="page">
      <div className="toolbar">
        <label className="btn primary">
          Excel取込
          <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} disabled={busy} />
        </label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">すべて</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="summary">
          {summary.map((s) => (
            <span key={s.status} className="chip">{s.status}: {s.count}</span>
          ))}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {preview && (
        <div className="preview card">
          <h3>取込プレビュー</h3>
          <p>
            有効 <b>{preview.validCount}</b> 件 / 無効 <b className="warn">{preview.invalidCount}</b> 件
          </p>
          {preview.invalidCount > 0 && (
            <details>
              <summary>無効な行を確認 ({preview.invalidCount})</summary>
              <ul className="invalid-list">
                {preview.invalid.map((r, i) => (
                  <li key={i}>{r.company || '—'} / {r.person || '—'} / 「{r.rawPhone}」→ {r.reason}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="row">
            <button className="btn primary" onClick={confirmImport} disabled={busy || preview.validCount === 0}>
              {preview.validCount} 件を取り込む
            </button>
            <button className="btn" onClick={() => setPreview(null)} disabled={busy}>キャンセル</button>
          </div>
        </div>
      )}

      <table className="grid">
        <thead>
          <tr>
            <th>会社名</th><th>担当者</th><th>電話番号</th><th>メモ</th><th>ステータス</th><th>発信</th>
          </tr>
        </thead>
        <tbody>
          {contacts.length === 0 && (
            <tr><td colSpan={6} className="empty">リストが空です。Excelを取り込んでください。</td></tr>
          )}
          {contacts.map((c) => (
            <tr key={c.id}>
              <td>{c.company || '—'}</td>
              <td>{c.person || '—'}</td>
              <td className="mono">{c.phone}</td>
              <td>{c.memo || ''}</td>
              <td>
                <select value={c.status} onChange={(e) => changeStatus(c.id, e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td>
                <button className="btn small" onClick={() => setCallContact(c)}>手動発信</button>
                <button className="btn small" onClick={() => setAiContact(c)}>AI発信</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {callContact && (
        <CallModal
          contact={callContact}
          script={activeScript}
          onClose={() => setCallContact(null)}
          onSaved={load}
        />
      )}

      {aiContact && (
        <AiCallModal
          contact={aiContact}
          onClose={() => setAiContact(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
