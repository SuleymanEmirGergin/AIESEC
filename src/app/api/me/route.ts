import { NextResponse } from "next/server";
import { emailEnabled } from "../../../auth";
import { currentMember, unauthorized } from "../../../server/backend";

/** /api/me -> oturumdaki onayli uye (ad, e-posta, rol). Backend'e gitmiyor. */

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await currentMember();
  if (!member) return unauthorized();
  return NextResponse.json({ email: member.email, name: member.name, role: member.role, emailLogin: emailEnabled });
}
