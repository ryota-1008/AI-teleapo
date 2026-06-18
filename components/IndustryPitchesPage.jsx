'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';

const BLANK = { id: null, keyword: '', pitch: '', is_default: false };

// 業種別トークの管理。業種に keyword が含まれたら、その pitch をAI発信時に渡す。
export default function IndustryPitchesPage() {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try { setItems(await api.listIndustryPitches()); setError(''); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!draft.is_default && !draft.keyword.trim()) { setError('キーワードを入力してください（既定トークの場合は不要）'); return; }
    setBusy(true);
    setError('');
    try {
      const saved = draft.id ? await api.updateIndustryPitch(draft.id, draft) : await api.createIndustryPitch(draft);
      setDraft(saved);
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove(item) {
    if (!window.confirm(`「${item.keyword || '既定トーク'}」を削除しますか？`)) return;
    try { await api.deleteIndustryPitch(item.id); if (draft.id === item.id) setDraft(BLANK); await load(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="page">
      <div className="card info">
        AI発信時、相手の<b>業種</b>にここの<b>キーワード</b>が含まれていれば、その<b>トーク</b>をAIに渡します（<code>{'{{industry_pitch}}'}</code>）。
        どれにも当たらない場合は「既定トーク」が使われます。
        <br />
        ※ ElevenLabsのエージェントのプロンプトに <code>{'{{industry_pitch}}'}</code> を入れておくと反映されます。
      </div>

      {error && <div className="error">{error}</div>}

      <div className="scripts-layout">
        <aside className="script-list">
          <button className="btn primary block" onClick={() => setDraft(BLANK)}>＋ 新規トーク</button>
          {items.length === 0 && <p className="empty">まだありません</p>}
          {items.map((s) => (
            <button key={s.id} className={draft.id === s.id ? 'script-item active' : 'script-item'} onClick={() => setDraft(s)}>
              <span className="script-title">{s.is_default ? '（既定トーク）' : s.keyword || '(キーワード未設定)'}</span>
              {s.is_default ? <span className="chip">既定</span> : null}
            </button>
          ))}
        </aside>

        <section className="script-edit card">
          <label className="field">
            <span>業種キーワード（業種にこの語が含まれたら一致）</span>
            <input
              value={draft.keyword}
              onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
              placeholder="例: 製造 / 学術 / 小売 / 建設"
              disabled={draft.is_default}
            />
          </label>

          <label className="field">
            <span>トーク（この業種向けの提案・話す内容）</span>
            <textarea
              rows={10}
              value={draft.pitch}
              onChange={(e) => setDraft({ ...draft, pitch: e.target.value })}
              placeholder="例: 製造業のコスト削減事例を中心に、現場の〇〇課題に触れて…"
            />
          </label>

          <label className="checkbox">
            <input type="checkbox" checked={!!draft.is_default} onChange={(e) => setDraft({ ...draft, is_default: e.target.checked })} />
            どの業種にも当たらない時の「既定トーク」にする
          </label>

          <div className="row">
            <button className="btn primary" onClick={save} disabled={busy}>{draft.id ? '保存' : '作成'}</button>
            {draft.id && <button className="btn danger-text" onClick={() => remove(draft)} disabled={busy}>削除</button>}
          </div>
        </section>
      </div>
    </div>
  );
}
