// ElevenLabs AIモードのヘルパー (DESIGN 2-3, 7, 14)。
// 自分が書くのは「発信APIを1回叩く」と「webhookを検証して保存する」だけ。
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const REQUIRED = ['ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID', 'ELEVENLABS_PHONE_NUMBER_ID'];

export function isElevenLabsConfigured() {
  return REQUIRED.every((k) => !!process.env[k]);
}

// AI発信: ElevenLabsのTwilio outbound-call APIを1回叩く (DESIGN 14)
export async function startAiCall(contact) {
  const res = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id: process.env.ELEVENLABS_AGENT_ID,
      agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
      to_number: contact.phone, // +81形式
      conversation_initiation_client_data: {
        dynamic_variables: {
          // エージェントのプロンプト内で {{company}} {{person}} として参照
          company: contact.company || '',
          person: contact.person || '',
        },
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.detail?.message || data.message || `ElevenLabs API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data; // { success, message, conversation_id, callSid }
}

// post-call webhookの署名検証＋パース (DESIGN 14-3)。
// 公式SDKが t=,v0= スキームのHMAC-SHA256検証＋タイムスタンプ検証を行う。
let _client;
export async function verifyWebhook(rawBody, sigHeader) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) throw new Error('webhook_secret_not_configured');
  _client ??= new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY || 'unused' });
  // rawBody は Buffer/string どちらでも文字列化して渡す
  return _client.webhooks.constructEvent(rawBody.toString('utf8'), sigHeader, secret);
}
