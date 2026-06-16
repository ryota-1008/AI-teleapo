import { useEffect, useState } from 'react';
import { api } from '../api.js';
import CallModal from '../components/CallModal.jsx';
import AiCallModal from '../components/AiCallModal.jsx';
import ContactEditModal from '../components/ContactEditModal.jsx';

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
  const [editTarget, setEditTarget] = useState(undefined); // undefined=閉/null=新規/obj=編集
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
      await api.importExcel(preview.file, true, preview.mapping);
      setPreview(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // 列マッピングを変更して、プレビューを再計算する
  async function remap(field, value) {
    const idx = value === '' ? null : Number(value);
    const newMapping = { ...preview.mapping, [field]: idx };
    setBusy(true);
    try {
      const result = await api.importExcel(preview.file, false, newMapping);
      setPreview({ file: preview.file, ...result });
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

  async function deleteContact(c) {
    if (!window.confirm(`「${c.company || c.phone}」を削除しますか？`)) return;
    try {
      await api.deleteContact(c.id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="page">
      <div className="toolbar">
        <label className="btn primary">
          Excel取込
          <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} disabled={busy} />
        </label>
        <button className="btn" onClick={() => setEditTarget(null)}>＋ 手動追加</button>
        <button className="btn" onClick={() => api.exportContacts().catch((e) => setError(e.message))} disabled={contacts.length === 0}>
          エクスポート
        </button>
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
          <h3>取込プレビュー — 列の対応を確認</h3>

          {/* 列マッピング編集 */}
          <div className="mapping-grid">
            {[
              ['company', '会社名'],
              ['person', '担当者'],
              ['phone', '電話番号 *'],
              ['memo', 'メモ'],
            ].map(([field, label]) => (
              <label key={field} className="map-field">
                <span>{label}</span>
                <select
                  value={preview.mapping[field] ?? ''}
                  onChange={(e) => remap(field, e.target.value)}
                  disabled={busy}
                  className={field === 'phone' && preview.phoneMissing ? 'map-missing' : ''}
                >
                  <option value="">（なし）</option>
                  {preview.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `列${i + 1}`}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {/* サンプル表示(先頭数行) */}
          {preview.sampleData?.length > 0 && (
            <div className="sample-wrap">
              <table className="sample-table">
                <thead>
                  <tr>{preview.headers.map((h, i) => <th key={i}>{h || `列${i + 1}`}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.sampleData.map((r, ri) => (
                    <tr key={ri}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.phoneMissing && <div className="error">電話番号の列を選んでください（必須）。</div>}

          <p>
            取込 <b>{preview.validCount}</b> 件
            {preview.noPhoneCount > 0 && <> / 電話なし <b className="warn">{preview.noPhoneCount}</b> 件</>}
            {preview.duplicateCount > 0 && <> / 重複スキップ <b className="warn">{preview.duplicateCount}</b> 件</>}
            {preview.invalidCount > 0 && <> / 無効 <b className="warn">{preview.invalidCount}</b> 件</>}
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
            <button className="btn primary" onClick={confirmImport} disabled={busy || preview.phoneMissing || preview.validCount === 0}>
              {preview.validCount} 件を取り込む
            </button>
            <button className="btn" onClick={() => setPreview(null)} disabled={busy}>キャンセル</button>
          </div>
        </div>
      )}

      <table className="grid">
        <thead>
          <tr>
            <th>会社名</th><th>担当者</th><th>電話番号</th><th>メモ</th><th>ステータス</th><th>発信</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {contacts.length === 0 && (
            <tr><td colSpan={7} className="empty">リストが空です。Excel取込か「手動追加」で登録してください。</td></tr>
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
              <td className="nowrap">
                <button className="btn small" onClick={() => setEditTarget(c)}>編集</button>
                <button className="btn small danger-text" onClick={() => deleteContact(c)}>削除</button>
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

      {editTarget !== undefined && (
        <ContactEditModal
          contact={editTarget}
          onClose={() => setEditTarget(undefined)}
          onSaved={load}
        />
      )}
    </div>
  );
}
