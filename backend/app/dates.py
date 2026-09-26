"""Ekibin takvim gunu."""

from datetime import date, datetime, timedelta, timezone

# Turkiye 2016'dan beri yaz saati uygulamiyor: sabit UTC+3. zoneinfo
# yerine sabit fark, cunku Vercel'in Python calisma zamaninda saat dilimi
# veritabani olmayabilir.
TEAM_TZ = timezone(timedelta(hours=3))


def team_today() -> date:
    """
    Ekip icin "bugun". UTC tarihi gece 00:00-03:00 arasinda bir onceki gunu
    veriyordu: o saatlerde yazilan temas dunun tarihini aliyor, Bugun
    sayaci kayiyordu.
    """
    return datetime.now(TEAM_TZ).date()
