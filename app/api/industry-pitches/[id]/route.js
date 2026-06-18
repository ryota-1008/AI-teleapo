import { industryPitchesRepo } from '@/lib/db';

// PATCH /api/industry-pitches/:id — 更新
export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  return Response.json(await industryPitchesRepo.update(Number(id), body));
}

// DELETE /api/industry-pitches/:id — 削除
export async function DELETE(request, { params }) {
  const { id } = await params;
  await industryPitchesRepo.remove(Number(id));
  return new Response(null, { status: 204 });
}
