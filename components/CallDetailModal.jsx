'use client';
// 架電1件の詳細 (DESIGN 画面5)。手動はメモ、AIは会話ログ・評価結果を表示する。
function safeParse(json) {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

function fmt(dt) {
  if (!dt) return '—';
  const d = new Date(dt.includes('T') ? dt : dt.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? dt : d.toLocaleString('ja-JP');
}

function durationLabel(start, end) {
  if (!start || !end) return null;
  const s = new Date(start.includes('T') ? start : start.replace(' ', 'T') + 'Z');
  const e = new Date(end.includes('T') ? end : end.replace(' ', 'T') + 'Z');
  const sec = Math.round((e - s) / 1000);
  if (!Number.isFinite(sec) || sec < 0) return null;
  const m = Math.floor(sec / 60);
  return `${m}分${sec % 60}秒`;
}

export default function CallDetailModal({ call, onClose }) {
  const transcript = safeParse(call.transcript);
  const analysis = safeParse(call.analysis);
  const dur = durationLabel(call.started_at, call.ended_at);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{call.company || '(会社名なし)'}</div>
            <div className="muted">{call.person || '担当者不明'} ・ <span className="mono">{call.phone || '—'}</span></div>
          </div>
          <span className={call.mode === 'ai' ? 'chip ai' : 'chip'}>{call.mode === 'ai' ? 'AI' : '手動'}</span>
        </div>

        <div className="detail-meta">
          <div><span className="muted">結果</span><b>{call.result || '—'}</b></div>
          <div><span className="muted">開始</span>{fmt(call.started_at)}</div>
          <div><span className="muted">終了</span>{fmt(call.ended_at)}</div>
          {dur && <div><span className="muted">通話時間</span>{dur}</div>}
        </div>

        {call.note && (
          <div className="script-box">
            <div className="script-box-head">メモ</div>
            <div className="script-body">{call.note}</div>
          </div>
        )}

        {/* AIモードの評価結果 */}
        {analysis && (
          <div className="script-box">
            <div className="script-box-head">評価結果</div>
            <div className="script-body">
              {analysis.transcript_summary && <p>{analysis.transcript_summary}</p>}
              {'call_successful' in analysis && (
                <p className="muted">判定: {String(analysis.call_successful)}</p>
              )}
              {analysis.data_collection_results && (
                <ul className="kv">
                  {Object.entries(analysis.data_collection_results).map(([k, v]) => (
                    <li key={k}><b>{k}</b>: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* AIモードの会話ログ */}
        {transcript && Array.isArray(transcript) && (
          <div className="script-box">
            <div className="script-box-head">会話ログ</div>
            <div className="script-body transcript">
              {transcript.map((turn, i) => (
                <div key={i} className={turn.role === 'agent' ? 'turn agent' : 'turn user'}>
                  <span className="turn-role">{turn.role === 'agent' ? 'AI' : '相手'}</span>
                  <span className="turn-msg">{turn.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {call.mode === 'ai' && !transcript && !analysis && (
          <div className="info small">この通話の会話ログ・評価結果はまだ届いていません（post-call webhook受信後に表示されます）。</div>
        )}

        <div className="row">
          <button className="btn" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
