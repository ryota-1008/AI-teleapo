import { contactsRepo } from '@/lib/db';

// GET /api/contacts/summary — ステータス別件数
export async function GET() {
  return Response.json(await contactsRepo.statusSummary());
}
