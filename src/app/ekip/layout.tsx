import { requireAdminPage } from "../../server/requireAdminPage";

export const dynamic = "force-dynamic";

export default async function AdminOnlyLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return children;
}
