'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/apiClient';
import CallDetailModal from '@/components/CallDetailModal';

const RESULTS = ['未架電', '不在', 'アポ獲得', 'NG', '再架電'];

function fmt(dt) {
  if (!dt) return '—';
  const d = new Date(dt.includes('T') ? dt : dt.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? dt : d.toLocaleString('ja-JP', { hour12: false });
}

export default function HistoryPage() {
  const [calls, setCalls] = useState([]);
  const [error, setError] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [detail, setDetail] = useState(null);

  function load() {
    api.listCalls().then(setCalls).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => calls.filter(
      (c) => (!modeFilter || c.mode === modeFilter) && (!resultFilter || c.result === resultFilter)
    ),
    [calls, modeFilter, resultFilter]
  );

  // サマリー: 総数 / モード別 / 結果別
  const stats = useMemo(() => {
    const byResult = {};
    let manual = 0, ai = 0;
    for (const c of calls) {
      if (c.result) byResult[c.result] = (byResult[c.result] || 0) + 1;
      if (c.mode === 'ai') ai++; else manual++;
    }
    return { total: calls.length, manual, ai, byResult };
  }, [calls]);

  function hasDetail(c) {
    return !!(c.note || c.transcript || c.analysis || c.mode === 'ai');
  }

  return (
    <div className="page">
      <div className="toolbar">
        <h2 style={{ margin: 0, fontSize: 18 }}>架電履歴</h2>
        <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}>
          <option value="">全モード</option>
          <option value="manual">手動</option>
          <option value="ai">AI</option>
        </select>
        <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
          <option value="">全結果</option>
          {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className="btn small" onClick={load}>更新</button>
        <button className="btn small" onClick={() => api.exportCalls().catch((e) => setError(e.message))} disabled={calls.length === 0}>エクスポート</button>
        <div className="summary">
          <span className="chip">総数: {stats.total}</span>
          <span className="chip">手動: {stats.manual}</span>
          <span className="chip ai">AI: {stats.ai}</span>
          {RESULTS.filter((r) => stats.byResult[r]).map((r) => (
            <span key={r} className="chip">{r}: {stats.byResult[r]}</span>
          ))}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <table className="grid">
        <thead>
          <tr><th>日時</th><th>会社</th><th>担当</th><th>電話番号</th><th>モード</th><th>結果</th><th>メモ</th><th></th></tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={8} className="empty">
              {calls.length === 0 ? 'まだ架電履歴はありません。' : '条件に一致する履歴がありません。'}
            </td></tr>
          )}
          {filtered.map((c) => (
            <tr key={c.id}>
              <td className="nowrap">{fmt(c.started_at)}</td>
              <td>{c.company || '—'}</td>
              <td>{c.person || '—'}</td>
              <td className="mono">{c.phone || '—'}</td>
              <td><span className={c.mode === 'ai' ? 'chip ai' : 'chip'}>{c.mode === 'ai' ? 'AI' : '手動'}</span></td>
              <td>{c.result || '—'}</td>
              <td className="truncate">{c.note || ''}</td>
              <td>
                {hasDetail(c) && <button className="btn small" onClick={() => setDetail(c)}>詳細</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {detail && <CallDetailModal call={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
