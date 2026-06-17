import { verifyWebhook } from '@/lib/elevenlabs';
import { callsRepo, contactsRepo } from '@/lib/db';

// POST /webhooks/elevenlabs — post-call webhook（署名検証 → 種別分岐 → 保存）
export async function POST(request) {
  const raw = await request.text(); // 生ボディ(HMAC検証に必要)
  let event;
  try {
    if (process.env.ELEVENLABS_WEBHOOK_SECRET) {
      event = await verifyWebhook(raw, request.headers.get('elevenlabs-signature'));
    } else {
      console.warn('[webhook] ELEVENLABS_WEBHOOK_SECRET 未設定: 署名検証をスキップ');
      event = JSON.parse(raw);
    }
  } catch (e) {
    console.error('[webhook] 署名検証に失敗:', e.message);
    return Response.json({ error: 'invalid_signature' }, { status: 401 });
  }

  try {
    await handleEvent(event);
  } catch (e) {
    console.error('[webhook] 処理エラー:', e.message);
  }
  return Response.json({ received: true });
}

async function handleEvent(event) {
  const type = event?.type;
  const data = event?.data || {};
  const conversationId = data.conversation_id;
  const call = conversationId ? await callsRepo.getByConversationId(conversationId) : null;

  if (type === 'post_call_transcription') {
    if (!call) { console.warn('[webhook] 該当通話なし', conversationId); return; }
    await callsRepo.update(call.id, {
      transcript: data.transcript ? JSON.stringify(data.transcript) : null,
      analysis: data.analysis ? JSON.stringify(data.analysis) : null,
      ended_at: new Date().toISOString(),
    });
    console.log('[webhook] post_call_transcription 保存 call_id=', call.id);
  } else if (type === 'call_initiation_failure') {
    if (call) {
      await callsRepo.update(call.id, { result: '不在', ended_at: new Date().toISOString() });
      if (call.contact_id) await contactsRepo.update(call.contact_id, { status: '不在' });
      console.log('[webhook] call_initiation_failure → 不在 call_id=', call.id);
    } else {
      console.warn('[webhook] failure: 該当通話なし', conversationId);
    }
  } else {
    console.log('[webhook] 未処理タイプ:', type);
  }
}
