import logging
import os
import threading
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.middleware import OVERPASS_REQUESTS_TOTAL

logger = logging.getLogger(__name__)


class OverpassError(Exception):
    """Base exception for Overpass related errors."""

    pass


class OverpassTransientError(OverpassError):
    """Errors that are potentially recoverable (Mirror down, Timeout, 429)."""

    pass


class OverpassPermanentError(OverpassError):
    """Errors that won't resolve with retry (Query syntax, Input validation)."""

    pass


# Bank suresi ust uste hatalarda katlanarak uzuyor: base, 2*base, 4*base...
# Base kasten kisa. Tek bir zaman asimi calisan aynayi dakikalarca yoldan
# cikarmamali; buna karsilik hic cevap vermeyen ayna birkac turda tavana
# dayanip yoldan cekilmeli. Ceza suresi hatanin *tekrarina* bagli, tek bir
# hataya degil.
COOLDOWN_BASE_SEC = int(os.getenv("OVERPASS_COOLDOWN_BASE", "15"))
COOLDOWN_MAX_SEC = int(os.getenv("OVERPASS_COOLDOWN_MAX", "300"))

# Bir kez calismis ayna kac ust uste hataya kadar ayricalikli sayilir.
# Sinir olmasaydi kalici olarak olen eski-iyi bir ayna, saglam yeni bir
# aynayi sonsuza dek bloklardi.
PROVEN_FAIL_LIMIT = int(os.getenv("OVERPASS_PROVEN_FAIL_LIMIT", "3"))


class OverpassEndpoint:
    """State for a single Overpass mirror endpoint."""

    def __init__(self, url: str):
        self.url = url
        # Ust uste basarisizlik sayaci. Yalnizca basari sifirliyor; bankin
        # dolmasi sifirlamiyor. Aksi halde hic calismayan bir ayna her
        # turda ayni kisa cezayi alir ve asla yoldan cekilmezdi.
        self.fail_streak = 0
        self.cooldown_until: Optional[datetime] = None
        # Bu aynanin daha once gercekten calistigina dair kanit; secimde
        # hic denenmemis aynalara karsi onceligi bundan geliyor.
        self.last_success: Optional[datetime] = None

    def is_healthy(self, now: Optional[datetime] = None) -> bool:
        """
        Bank suresi dolmus mu?

        Kasten yan etkisiz: durumu burada sifirlamak, "hic cevap vermeyen
        ayna" ile "bir kez takilan ayna" arasindaki farki siliyordu.
        """
        if not self.cooldown_until:
            return True
        return (now or datetime.now()) > self.cooldown_until

    def cooldown_ends(self, now: Optional[datetime] = None) -> datetime:
        """Bankin dolacagi an; bankta degilse su an."""
        return self.cooldown_until or (now or datetime.now())

    def is_proven(self) -> bool:
        """
        Bu ayna gercekten calisti mi ve hala guvenilir mi?

        Secimde saglikten once bakilan olcut bu: hic cevap vermemis bir
        aynanin banki dolmus olmasi, onu calistigi bilinen bir aynadan
        daha iyi bir aday yapmaz.
        """
        return self.last_success is not None and self.fail_streak < PROVEN_FAIL_LIMIT

    def mark_failure(self, now: Optional[datetime] = None):
        """Basarisizligi kaydet ve katlanan bir bank suresi uygula."""
        now = now or datetime.now()
        self.fail_streak += 1
        # Us tavanla sinirli: seri gunlerce suren bir ayna icin 2**streak
        # gereksiz buyuk bir sayi uretirdi. Tavana ulasmak icin 16 kat
        # fazlasiyla yeter.
        shift = min(self.fail_streak - 1, 16)
        seconds = min(COOLDOWN_BASE_SEC * (2**shift), COOLDOWN_MAX_SEC)
        self.cooldown_until = now + timedelta(seconds=seconds)

    def mark_success(self, now: Optional[datetime] = None):
        """Seriyi sifirla, banki kaldir, basari zamanini isaretle."""
        self.fail_streak = 0
        self.cooldown_until = None
        self.last_success = now or datetime.now()


class OverpassClient:
    """Robust client with multi-endpoint failover and circuit breaker."""

    def __init__(self):
        # Configure endpoints from env
        urls_raw = os.getenv(
            "OVERPASS_URLS",
            os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter"),
        )
        urls = [u.strip() for u in urls_raw.split(",") if u.strip()]
        self.endpoints = [OverpassEndpoint(u) for u in urls]

        # Increased default to 60s
        self.timeout = int(os.getenv("OVERPASS_TIMEOUT", "60"))
        self._lock = threading.Lock()

        # Overpass kullanim politikasi kendini tanitan bir User-Agent
        # zorunlu kiliyor. Bu header olmadan sunucu istekleri
        # 406 Not Acceptable ile reddediyor.
        self.user_agent = os.getenv(
            "OVERPASS_USER_AGENT", "nearby-place-finder/1.0 (backend)"
        )

    def _select_endpoint(
        self, tried: set, now: Optional[datetime] = None
    ) -> OverpassEndpoint:
        """
        Bu deneme icin en umut verici aynayi sec.

        Sira:
        1. Bu sorguda henuz denenmemis olanlar. Bir sorgunun denemeleri
           farkli aynalara dagilmali; ayni kapiyi tekrar calmak, ayakta
           bir alternatif varsa onu hic gormemek demek.
        2. Aralarinda KANITLI olanlar (bir kez calismis ve ust uste az
           hata almis) once gelir -- SAGLIK degil kanit.

        (2) neden onemli: eski kod "banki dolmus ilk ayna"yi seciyordu.
        Hic cevap vermemis aynalarin da banki doluyor, dolayisiyla
        calisan ayna 15 sn'ligine banklandigi anda onlar one geciyordu.
        Uretimde tam olarak bu oldu: ust uste ingest'lerde istekler olu
        aynalara dagilip ConnectError ile 500 donuyordu. Artik kanitli
        ayna, bankta olsa bile her sorgunun ILK denemesini aliyor.

        (1) neden (2)'nin onunde: kanitli aynaya tum denemeler boyunca
        yapismak olculdu ve pahaliydi -- ayna 504 donerken tek bir
        ingest sorgusu 325 sn surdu ve hicbir alternatif denenmedi.
        Ilk deneme en iyi adaya, kalanlar kesfe gidiyor.

        Kanit sonsuza kadar surmuyor: ust uste PROVEN_FAIL_LIMIT hata
        alan ayna ayricaligini kaybediyor, boylece kalici olarak olen
        eski-iyi bir ayna yeni bir aynayi bloklamiyor.
        """
        now = now or datetime.now()
        with self._lock:
            return min(
                enumerate(self.endpoints),
                key=lambda t: (
                    t[1].url in tried,
                    not t[1].is_proven(),
                    t[1].fail_streak,
                    t[1].cooldown_ends(now),
                    t[0],
                ),
            )[1]

    async def query(self, query_text: str, debug: bool = False) -> Dict[str, Any]:
        """
        Execute query with retry/failover.

        Returns:
            Dict containing OSM results and debug metadata
        """
        # Deneme butcesi ayna sayisindan BUYUK olmali: tum aynalari bir kez
        # gezdikten sonra en iyi adaya geri donebilmek icin bir deneme daha
        # gerekiyor. Sabit 3 denemeyle 4 aynali kurulumda kanitli ayna
        # sorgu basina yalnizca tek sans aliyordu.
        #
        # Olculdu: kumi yuk altinda 504 donuyor ama TEKRAR denendiginde
        # geciyor. Yalnizca kumi yapilandirildiginda ayni ilce 4 sorgunun
        # dordunde de once 504 alip retry'da basardi (59 kayit). Dort
        # aynayla ayni ingest 500 donuyordu, cunku 2. ve 3. denemeler
        # erisilemeyen aynalarda harcanip kumi'ye donulemiyordu.
        attempts = max(3, len(self.endpoints) + 1)
        tried: set = set()

        @retry(
            stop=stop_after_attempt(attempts),
            wait=wait_exponential(multiplier=1, min=1, max=4),
            retry=retry_if_exception_type((OverpassTransientError, httpx.RequestError)),
            reraise=True,
        )
        async def _do_query():
            endpoint = self._select_endpoint(tried)
            tried.add(endpoint.url)

            # Bank suresi burada BEKLENMIYOR: denemeler arasi tempoyu
            # zaten tenacity'nin ustel beklemesi veriyor. Cooldown artik
            # bir kapi degil bir siralama sinyali - "bu aynayi en son
            # tercih et" demenin yolu. Burada ayrica uyumak hem sorguya
            # hem test takimina olculebilir sure ekliyordu.
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        endpoint.url,
                        data={"data": query_text},
                        headers={
                            "Content-Type": "application/x-www-form-urlencoded",
                            "User-Agent": self.user_agent,
                        },
                    )

                if response.status_code == 429:
                    raise OverpassTransientError("HTTP 429")

                if response.status_code in [500, 502, 503, 504]:
                    raise OverpassTransientError(f"HTTP {response.status_code}")

                # 4xx (429 disinda) sorgunun ya da basliklarimizin sorunu:
                # ornegin User-Agent eksikse Overpass 406 donuyor. Bunu
                # aynanin hatasi saymak, kendi hatamiz yuzunden tum
                # aynalari sirayla banka gondermek demekti.
                if 400 <= response.status_code < 500:
                    raise OverpassPermanentError(f"HTTP {response.status_code}")

                response.raise_for_status()
                data = response.json()

                if "remark" in data or "message" in data:
                    msg = data.get("remark") or data.get("message")
                    if any(
                        kw in msg.lower()
                        for kw in ["too many", "load", "runtime error"]
                    ):
                        raise OverpassTransientError("Overpass Remark Limit")
                    raise OverpassPermanentError(msg)

                endpoint.mark_success()
                OVERPASS_REQUESTS_TOTAL.labels(status="success").inc()
                if debug:
                    data["_debug"] = {"endpoint": endpoint.url}
                return data

            except OverpassPermanentError:
                # Suc aynada degil bizde: banklamak yanlis hedefi cezalandirir
                # ve bir sonraki istekte saglam aynayi elimizden alir.
                OVERPASS_REQUESTS_TOTAL.labels(status="error").inc()
                raise

            except Exception as e:
                OVERPASS_REQUESTS_TOTAL.labels(status="error").inc()
                endpoint.mark_failure()
                # Hangi aynanin neden banklandigi gorunur olmali: bu bilgi
                # olmadan "ingest 500 donuyor" ile "su ayna erisilemez"
                # arasindaki mesafeyi kapatmak zor.
                logger.warning(
                    "Overpass ayna basarisiz: %s (%s: %s) - %s. hata, bank %s'e kadar",
                    endpoint.url,
                    type(e).__name__,
                    e,
                    endpoint.fail_streak,
                    endpoint.cooldown_until,
                )
                raise e

        return await _do_query()


# Global client instance
overpass_client = OverpassClient()


def build_overpass_query(
    requested_type: str,
    lat: float,
    lon: float,
    radius: int,
    stage: int = 1,
    mode: str = "around",
    bbox: Optional[Tuple[float, float, float, float]] = None,
) -> str:
    """
    Build optimized Overpass QL query.

    Args:
        requested_type: Search category
        lat, lon, radius: Search constraints
        stage: 1 (Named only), 2 (Unnamed/All)
        mode: "around" or "bbox"
        bbox: Optional pre-calculated bbox
    """
    # Location chunk
    if mode == "bbox" and bbox:
        loc = f"({bbox[0]:.6f},{bbox[1]:.6f},{bbox[2]:.6f},{bbox[3]:.6f})"
    else:
        loc = f"(around:{radius},{lat},{lon})"

    # Filter chunks
    name_filter = '["name"]' if stage == 1 else '[!"name"]'

    # Tag logic mapping
    type_filters = {
        "factory": [
            '["man_made"="works"]',
            '["industrial"]',
            '["building"="industrial"]',
            '["building"="warehouse"]',
            '["landuse"="industrial"]',
        ],
        "office": ['["office"]', '["building"="commercial"]', '["building"="office"]'],
        "workshop": ['["craft"]', '["industrial"="workshop"]'],
        "kindergarten": ['["amenity"="kindergarten"]', '["building"="kindergarten"]'],
        "school": [
            '["amenity"="school"]',
            '["building"="school"]',
            '["education"="school"]',
        ],
        "college_university": [
            '["amenity"="university"]',
            '["amenity"="college"]',
            '["building"="university"]',
            '["education"="university"]',
        ],
        "hotel": ['["tourism"~"^(hotel|hostel|motel|guest_house|resort)$"]'],
        "company": ['["office"~"^(company|it|telecommunication|energy_supplier)$"]'],
        # Holding etiketle degil adla bulunur; adaylar ofis havuzu + ad.
        "holding": ['["office"]', '["name"~"[Hh]olding"]'],
        "real_estate": ['["office"="estate_agent"]'],
        "language_school": ['["amenity"="language_school"]'],
        "travel_agency": ['["office"="travel_agent"]', '["shop"="travel_agency"]'],
        "zoo_aquarium": ['["tourism"~"^(zoo|aquarium)$"]'],
        "theme_park": ['["tourism"="theme_park"]', '["leisure"="water_park"]'],
        "museum": ['["tourism"="museum"]'],
        "botanical_garden": ['["leisure"="garden"]["garden:type"="botanical"]'],
        "nature_park": ['["boundary"="national_park"]', '["leisure"="nature_reserve"]'],
    }

    # Specialized type map
    t_map = {
        "primary_school": "school",
        "middle_school": "school",
        "high_school": "school",
        "private_school": "school",
        "college_keyword": "school",
        "college_university": "college_university",
    }
    key = t_map.get(requested_type, requested_type)

    filters = type_filters.get(key, [])

    query_lines = []
    for f in filters:
        # Optimization: use nwr shorthand
        query_lines.append(f"  nwr{f}{name_filter}{loc};")

    timeout_cfg = int(os.getenv("OVERPASS_TIMEOUT", "60"))

    query_body = "\n".join(query_lines)

    # `qt`: sonuclari id yerine quadtile (mekansal) sirasina gore dondur.
    # Overpass'in varsayilan id siralamasi ek bir siralama adimi gerektiriyor;
    # qt bu adimi atliyor. Sonuc kumesi ayni, sadece sira degisiyor ve
    # sonuclar zaten mesafeye gore yeniden siralaniyor.
    query = f"""[out:json][timeout:{timeout_cfg}];
(
{query_body}
);
out tags center qt;"""
    return query
