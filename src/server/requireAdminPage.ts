import { redirect } from "next/navigation";
import { currentMember } from "./backend";

/**
 * Yonetici sayfalarinin sunucu tarafi kapisi. Middleware rolu oturum
 * token'indan okuyor (giriste yazilir, 30 gun gecerli); yetkisi alinan
 * biri o sure boyunca sayfa iskeletini gorebilirdi. Burada rol her
 * acilista veritabanindan okunuyor.
 */
export async function requireAdminPage(): Promise<void> {
  const me = await currentMember();
  if (!me) redirect("/giris");
  if (me.role !== "admin") redirect("/");
}
