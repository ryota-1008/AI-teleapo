// ElevenLabs AIモードのヘルパー（発信API + webhook検証）。
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const REQUIRED = ['ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID', 'ELEVENLABS_PHONE_NUMBER_ID'];

export function isElevenLabsConfigured() {
  return REQUIRED.every((k) => !!process.env[k]);
}

export async function startAiCall(contact, extraVars = {}) {
  const res = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: process.env.ELEVENLABS_AGENT_ID,
      agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
      to_number: contact.phone,
      conversation_initiation_client_data: {
        // プロンプト内で {{company}} {{person}} {{industry}} {{industry_pitch}} として参照
        dynamic_variables: { company: contact.company || '', person: contact.person || '', ...extraVars },
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

let _client;
export async function verifyWebhook(rawBody, sigHeader) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) throw new Error('webhook_secret_not_configured');
  _client ??= new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY || 'unused' });
  return _client.webhooks.constructEvent(rawBody.toString('utf8'), sigHeader, secret);
}
