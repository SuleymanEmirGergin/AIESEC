/** Giris baglantisi e-postasi. Duz metin + sade HTML; gorsel yok, spam filtresine takilmasin. */
export function loginEmail(url: string): { subject: string; text: string; html: string } {
  const escaped = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return {
    subject: "POI Finder giriş bağlantınız",
    text: `POI Finder'a giriş yapmak için bu bağlantıyı açın (1 saat geçerli):\n\n${url}\n\nBu isteği siz yapmadıysanız e-postayı yok sayabilirsiniz.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#192029">
  <p style="font-size:16px;font-weight:bold;margin:0 0 12px">POI Finder</p>
  <p style="margin:0 0 20px">Giriş yapmak için aşağıdaki düğmeye tıklayın. Bağlantı 1 saat geçerli.</p>
  <p style="margin:0 0 24px"><a href="${escaped}" style="background:#0064da;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Giriş yap</a></p>
  <p style="font-size:12px;color:#6b7280;margin:0">Bu isteği siz yapmadıysanız e-postayı yok sayabilirsiniz.</p>
</div>`,
  };
}
