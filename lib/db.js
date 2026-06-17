// データアクセス層 (Prisma)。既存フロントを壊さないよう、出力は snake_case に揃える。
import { prisma } from './prisma.js';

export const VALID_STATUSES = ['未架電', '不在', 'アポ獲得', 'NG', '再架電'];

// --- 出力マッピング (camelCase → 旧API互換の snake_case) ---
const contactOut = (c) =>
  c && {
    id: c.id, company: c.company, person: c.person, phone: c.phone,
    memo: c.memo, status: c.status,
    next_call_at: c.nextCallAt, created_at: c.createdAt,
  };

const callOut = (c) =>
  c && {
    id: c.id, contact_id: c.contactId, mode: c.mode, result: c.result, note: c.note,
    transcript: c.transcript, analysis: c.analysis,
    el_conversation_id: c.elConversationId, twilio_call_sid: c.twilioCallSid,
    started_at: c.startedAt, ended_at: c.endedAt,
    company: c.contact?.company ?? null,
    person: c.contact?.person ?? null,
    phone: c.contact?.phone ?? null,
  };

const scriptOut = (s) => s && { id: s.id, title: s.title, body: s.body, is_active: s.isActive };

// ---- contacts ----
export const contactsRepo = {
  async list({ status } = {}) {
    const rows = await prisma.contact.findMany({ where: status ? { status } : {}, orderBy: { id: 'asc' } });
    return rows.map(contactOut);
  },
  async get(id) {
    return contactOut(await prisma.contact.findUnique({ where: { id } }));
  },
  async create({ company, person, phone, memo }) {
    return contactOut(await prisma.contact.create({
      data: { company: company ?? null, person: person ?? null, phone, memo: memo ?? null },
    }));
  },
  async remove(id) {
    await prisma.contact.delete({ where: { id } });
  },
  async callCount(id) {
    return prisma.call.count({ where: { contactId: id } });
  },
  async existingPhones() {
    const rows = await prisma.contact.findMany({ select: { phone: true } });
    return rows.map((r) => r.phone);
  },
  async insertMany(rows) {
    const r = await prisma.contact.createMany({
      data: rows.map((x) => ({ company: x.company ?? null, person: x.person ?? null, phone: x.phone, memo: x.memo ?? null })),
    });
    return r.count;
  },
  async update(id, fields) {
    const map = { company: 'company', person: 'person', phone: 'phone', memo: 'memo', status: 'status', next_call_at: 'nextCallAt' };
    const data = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k in map) data[map[k]] = k === 'next_call_at' && v ? new Date(v) : v;
    }
    if (Object.keys(data).length === 0) return contactsRepo.get(id);
    return contactOut(await prisma.contact.update({ where: { id }, data }));
  },
  async statusSummary() {
    const g = await prisma.contact.groupBy({ by: ['status'], _count: { _all: true } });
    return g.map((x) => ({ status: x.status, count: x._count._all }));
  },
};

// ---- calls ----
export const callsRepo = {
  async list() {
    const rows = await prisma.call.findMany({ orderBy: { id: 'desc' }, include: { contact: true } });
    return rows.map(callOut);
  },
  async get(id) {
    return callOut(await prisma.call.findUnique({ where: { id }, include: { contact: true } }));
  },
  async getByConversationId(cid) {
    return callOut(await prisma.call.findFirst({ where: { elConversationId: cid }, include: { contact: true } }));
  },
  async insert(call) {
    const c = await prisma.call.create({
      data: {
        contactId: call.contact_id ?? null,
        mode: call.mode,
        result: call.result ?? null,
        note: call.note ?? null,
        elConversationId: call.el_conversation_id ?? null,
        twilioCallSid: call.twilio_call_sid ?? null,
        startedAt: call.started_at ? new Date(call.started_at) : null,
      },
    });
    return callOut(c);
  },
  async update(id, fields) {
    const map = {
      result: 'result', note: 'note', transcript: 'transcript', analysis: 'analysis',
      el_conversation_id: 'elConversationId', twilio_call_sid: 'twilioCallSid',
      started_at: 'startedAt', ended_at: 'endedAt',
    };
    const data = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!(k in map)) continue;
      data[map[k]] = (k === 'started_at' || k === 'ended_at') && v ? new Date(v) : v;
    }
    if (Object.keys(data).length === 0) return callsRepo.get(id);
    return callOut(await prisma.call.update({ where: { id }, data, include: { contact: true } }));
  },
  async countToday() {
    const d = new Date();
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return prisma.call.count({ where: { startedAt: { gte: start } } });
  },
};

// ---- scripts ----
export const scriptsRepo = {
  async list() {
    return (await prisma.script.findMany({ orderBy: { id: 'asc' } })).map(scriptOut);
  },
  async getActive() {
    return scriptOut(await prisma.script.findFirst({ where: { isActive: true } }));
  },
  async upsert({ id, title, body, is_active }) {
    let saved;
    if (id) {
      saved = await prisma.script.update({ where: { id }, data: { title, body, isActive: !!is_active } });
    } else {
      saved = await prisma.script.create({ data: { title, body, isActive: !!is_active } });
    }
    if (is_active) {
      await prisma.script.updateMany({ where: { id: { not: saved.id } }, data: { isActive: false } });
    }
    return scriptOut(saved);
  },
};

// ---- settings ----
export const settingsRepo = {
  async get(key, fallback = null) {
    const row = await prisma.setting.findUnique({ where: { key } });
    return row ? row.value : fallback;
  },
  async set(key, value) {
    await prisma.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  },
};
