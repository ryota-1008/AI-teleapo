'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';

// 架電の安全設定 (DESIGN 11-5): キルスイッチと1日の架電上限。
export default function SettingsPage() {
  const [s, setS] = useState(null);
  const [cap, setCap] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function load() {
    try {
      const data = await api.getSettings();
      setS(data);
      setCap(data.daily_call_cap);
      setError('');
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function update(patch) {
    setSaving(true);
    setSaved(false);
    try {
      const data = await api.saveSettings(patch);
      setS(data);
      setCap(data.daily_call_cap);
      setSaved(true);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (!s) return <div className="page">{error ? <div className="error">{error}</div> : '読み込み中…'}</div>;

  const capReached = s.daily_call_cap > 0 && s.today_count >= s.daily_call_cap;

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: 18 }}>架電の安全設定</h2>
      {error && <div className="error">{error}</div>}

      {/* キルスイッチ */}
      <div className="card">
        <div className="setting-row">
          <div>
            <div className="setting-title">架電を一時停止（キルスイッチ）</div>
            <div className="muted small">ONの間は手動・AIとも新規発信を止めます。結果の記録は可能です。</div>
          </div>
          <button
            className={s.calls_paused ? 'btn danger' : 'btn primary'}
            onClick={() => update({ calls_paused: !s.calls_paused })}
            disabled={saving}
          >
            {s.calls_paused ? '停止中 → 再開する' : '稼働中 → 停止する'}
          </button>
        </div>
        {s.calls_paused && <div className="info small" style={{ marginTop: 10 }}>現在、発信は停止中です。</div>}
      </div>

      {/* 1日の架電上限 */}
      <div className="card">
        <div className="setting-title">1日の架電上限</div>
        <div className="muted small">同じ番号からの大量発信は着信拒否されやすいので上限を設けます。0 = 無制限。</div>
        <div className="row" style={{ marginTop: 12, alignItems: 'center' }}>
          <input
            type="number" min="0" value={cap}
            onChange={(e) => setCap(e.target.value)}
            style={{ width: 120, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}
          />
          <span className="muted">件 / 日</span>
          <button className="btn primary" onClick={() => update({ daily_call_cap: cap })} disabled={saving}>保存</button>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className={capReached ? 'chip live' : 'chip'} style={capReached ? { background: '#fee2e2', color: '#991b1b' } : {}}>
            本日の架電: {s.today_count}{s.daily_call_cap > 0 ? ` / ${s.daily_call_cap}` : '（無制限）'}
          </span>
          {capReached && <span className="warn small">上限に達しています</span>}
        </div>
      </div>

      {saved && <div className="info small">保存しました。</div>}
    </div>
  );
}
