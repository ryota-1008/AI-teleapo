import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function HistoryPage() {
  const [calls, setCalls] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listCalls().then(setCalls).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="page">
      <h2>架電履歴</h2>
      {error && <div className="error">{error}</div>}
      <table className="grid">
        <thead>
          <tr><th>日時</th><th>会社</th><th>電話番号</th><th>モード</th><th>結果</th><th>メモ</th></tr>
        </thead>
        <tbody>
          {calls.length === 0 && (
            <tr><td colSpan={6} className="empty">まだ架電履歴はありません。</td></tr>
          )}
          {calls.map((c) => (
            <tr key={c.id}>
              <td>{c.started_at || '—'}</td>
              <td>{c.company || '—'}</td>
              <td className="mono">{c.phone || '—'}</td>
              <td>{c.mode === 'ai' ? 'AI' : '手動'}</td>
              <td>{c.result || '—'}</td>
              <td>{c.note || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
