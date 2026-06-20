'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/apiClient';
import { suggestMapping, analyzeRows } from '@/lib/importMapping';
import CallModal from '@/components/CallModal';
import AiCallModal from '@/components/AiCallModal';
import ContactEditModal from '@/components/ContactEditModal';

const STATUSES = ['未架電', '不在', 'アポ獲得', 'NG', '再架電'];
const STATUS_CLASS = { '未架電': 's-new', '不在': 's-absent', 'アポ獲得': 's-won', NG: 's-ng', '再架電': 's-recall' };
const STATUS_DOT = { '未架電': '#515b69', '不在': '#8a5a06', 'アポ獲得': '#1c6b41', NG: '#a83a2e', '再架電': '#285f9e' };
const CHUNK_SIZE = 500; // 1回の送信件数（Vercelの4.5MB制限を回避）

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
  const [progress, setProgress] = useState(null); // 取込進捗 {done,total}
  const [loadingMsg, setLoadingMsg] = useState(''); // ファイル読み込み中などの表示
  const [query, setQuery] = useState('');          // 検索語
  const [sort, setSort] = useState({ key: 'id', dir: 'asc' }); // 並べ替え

  // 検索 + 並べ替えを適用した表示用リスト
  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = contacts;
    if (q) {
      list = list.filter((c) =>
        [c.company, c.person, c.phone, c.industry].some((v) => String(v ?? '').toLowerCase().includes(q))
      );
    }
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sort.key] ?? '';
      const bv = b[sort.key] ?? '';
      if (sort.key === 'id') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'ja') * dir;
    });
  }, [contacts, query, sort]);

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }
  const arrow = (key) => (sort.key === key ? <span className="arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span> : null);

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

  // ブラウザ上でExcelを解析（大きいファイルでもサーバーに丸投げしない）
  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    setLoadingMsg(`Excelを読み込み中…（${file.name} / ${sizeMB}MB）`);
    // ローディング表示を先に画面へ反映してから重い解析を実行する
    await new Promise((r) => setTimeout(r, 50));
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      if (aoa.length === 0) { setError('シートが空です'); return; }
      const headers = (aoa[0] || []).map((h) => String(h ?? '').trim());
      const rows = aoa.slice(1);
      const mapping = suggestMapping(headers);
      setPreview({ fileName: file.name, headers, rows, mapping, ...analyzeRows(rows, mapping) });
    } catch (err) {
      setError(`Excelの解析に失敗しました: ${err.message}`);
    } finally {
      setBusy(false);
      setLoadingMsg('');
    }
  }

  // 列マッピング変更 → ブラウザ内で即再計算（サーバー往復なし）
  function remap(field, value) {
    const idx = value === '' ? null : Number(value);
    const mapping = { ...preview.mapping, [field]: idx };
    setPreview({ ...preview, mapping, ...analyzeRows(preview.rows, mapping) });
  }

  // 確定: 正規化済みレコードを分割してサーバーへ投入
  async function confirmImport() {
    const records = preview.fresh;
    setBusy(true);
    setProgress({ done: 0, total: records.length });
    let inserted = 0;
    let dupSkipped = 0;
    try {
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const r = await api.importChunk(chunk);
        inserted += r.inserted;
        dupSkipped += r.dupSkipped;
        setProgress({ done: Math.min(i + CHUNK_SIZE, records.length), total: records.length });
      }
      setPreview(null);
      setProgress(null);
      setError('');
      await load();
      window.alert(`取込完了: ${inserted}件追加 / 既存重複 ${dupSkipped}件スキップ`);
    } catch (err) {
      setError(`取込中にエラー: ${err.message}（${inserted}件まで追加済み）`);
      setProgress(null);
      await load();
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

  const statusCount = Object.fromEntries(summary.map((s) => [s.status, s.count]));
  const total = summary.reduce((n, s) => n + s.count, 0);

  return (
    <div className="page">
      <div className="stats">
        <div className="stat">
          <div className="label">総数</div>
          <div className="value">{total}</div>
        </div>
        {STATUSES.map((s) => (
          <div className="stat" key={s}>
            <div className="label"><span className="dot" style={{ background: STATUS_DOT[s] }} />{s}</div>
            <div className="value">{statusCount[s] || 0}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <label className={busy ? 'btn primary disabled' : 'btn primary'}>
          {loadingMsg ? '読み込み中…' : 'Excel取込'}
          <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} disabled={busy} />
        </label>
        <button className="btn" onClick={() => setEditTarget(null)}>＋ 手動追加</button>
        <button className="btn" onClick={() => api.exportContacts().catch((e) => setError(e.message))} disabled={contacts.length === 0}>
          エクスポート
        </button>
        <input
          className="searchbox"
          type="search"
          placeholder="会社名・担当者・番号で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">すべての状況</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="count">{view.length}件{query || filter ? `（全${contacts.length}件中）` : ''}</span>
      </div>

      {error && <div className="error">{error}</div>}

      {loadingMsg && (
        <div className="card info"><span className="spinner-dot" />{loadingMsg}</div>
      )}

      {preview && (
        <div className="preview card">
          <h3>取込プレビュー — 列の対応を確認</h3>

          {/* 列マッピング編集 */}
          <div className="mapping-grid">
            {[
              ['company', '会社名'],
              ['person', '担当者'],
              ['phone', '電話番号 *'],
              ['industry', '業種'],
              ['memo', 'メモ'],
            ].map(([field, label]) => (
              <label key={field} className="map-field">
                <span>{label}</span>
                <select
                  value={preview.mapping[field] ?? ''}
                  onChange={(e) => remap(field, e.target.value)}
                  disabled={busy}
                  className={field === 'phone' && preview.mapping.phone == null ? 'map-missing' : ''}
                >
                  <option value="">（なし）</option>
                  {preview.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `列${i + 1}`}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {/* サンプル表示(先頭5行) */}
          {preview.rows.length > 0 && (
            <div className="sample-wrap">
              <table className="sample-table">
                <thead>
                  <tr>{preview.headers.map((h, i) => <th key={i}>{h || `列${i + 1}`}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((r, ri) => (
                    <tr key={ri}>{preview.headers.map((_, ci) => <td key={ci}>{String(r[ci] ?? '')}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.mapping.phone == null && <div className="error">電話番号の列を選んでください（必須）。</div>}

          <p>
            取込予定 <b>{preview.validCount}</b> 件
            {preview.noPhoneCount > 0 && <> / 電話なし <b className="warn">{preview.noPhoneCount}</b> 件</>}
            {preview.withinDupCount > 0 && <> / ファイル内重複 <b className="warn">{preview.withinDupCount}</b> 件</>}
            {preview.invalidCount > 0 && <> / 無効 <b className="warn">{preview.invalidCount}</b> 件</>}
          </p>
          {preview.invalidCount > 0 && (
            <details>
              <summary>無効な行を確認 (先頭{preview.invalidSample.length}件)</summary>
              <ul className="invalid-list">
                {preview.invalidSample.map((r, i) => (
                  <li key={i}>{r.company || '—'} / {r.person || '—'} / 「{r.rawPhone}」→ {r.reason}</li>
                ))}
              </ul>
            </details>
          )}

          {progress && (
            <p className="muted">取込中… {progress.done} / {progress.total} 件</p>
          )}

          <div className="row">
            <button className="btn primary" onClick={confirmImport} disabled={busy || preview.mapping.phone == null || preview.validCount === 0}>
              {preview.validCount} 件を取り込む
            </button>
            <button className="btn" onClick={() => setPreview(null)} disabled={busy}>キャンセル</button>
          </div>
        </div>
      )}

      <table className="grid">
        <thead>
          <tr>
            <th className="sortable" onClick={() => toggleSort('company')}>会社名{arrow('company')}</th>
            <th className="sortable" onClick={() => toggleSort('person')}>担当者{arrow('person')}</th>
            <th>電話番号</th>
            <th className="sortable" onClick={() => toggleSort('industry')}>業種{arrow('industry')}</th>
            <th className="sortable" onClick={() => toggleSort('status')}>状況{arrow('status')}</th>
            <th>発信</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {view.length === 0 && (
            <tr><td colSpan={7} className="empty">
              {contacts.length === 0
                ? 'まだ連絡先がありません。Excelを取り込むか「手動追加」で登録してください。'
                : '条件に合う連絡先がありません。'}
            </td></tr>
          )}
          {view.map((c) => (
            <tr key={c.id}>
              <td>{c.company || '—'}</td>
              <td>{c.person || '—'}</td>
              <td className="mono">{c.phone}</td>
              <td className="truncate">{c.industry || ''}</td>
              <td>
                <select
                  className={`status-select ${STATUS_CLASS[c.status] || ''}`}
                  value={c.status}
                  onChange={(e) => changeStatus(c.id, e.target.value)}
                >
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
