import { NextResponse } from "next/server";
import { currentMember, unauthorized } from "../../../../server/backend";
import { listAssignableMembers } from "../../../../server/team";

/** /api/team/members: sorumlu secimi icin ekip (her uye gorebilir). */

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentMember())) return unauthorized();
  return NextResponse.json(await listAssignableMembers());
}
