"""School level and B2B type classification logic."""

import re
from typing import Optional

# ASCII katlama: "Özel İSTANBUL" -> "ozel istanbul". Arama (queries.fold_sql)
# ve ad kurallari ayni tabloyu kullaniyor. Once harfler, sonra lower():
# SQLite'in lower()'i yalnizca ASCII biliyor.
FOLD_MAP = {
    "Ç": "c", "ç": "c", "Ğ": "g", "ğ": "g", "İ": "i", "I": "i", "ı": "i",
    "Ö": "o", "ö": "o", "Ş": "s", "ş": "s", "Ü": "u", "ü": "u",
    "Â": "a", "â": "a", "Î": "i", "î": "i", "Û": "u", "û": "u",
}
_FOLD_TABLE = str.maketrans(FOLD_MAP)


def ascii_fold(text: str) -> str:
    return text.translate(_FOLD_TABLE).lower()


# Overture 'college_university' icin ad kurallari (katlanmis ada uygulanir).
_UNIVERSITY = re.compile(
    # "univ": yazim hatalari da ("Ünivetsitesi"); "universal" haric.
    r"\buniv(?!ersal)|\buni\b|fakulte|faculty|yuksek ?okul|\bmyo\b|meslek yuksek"
    r"|enstitu|institute|kampus|campus|yerleske|rektorluk|akademi|academy"
    r"|konservatuvar|conservatory|\bbolumu\b|arastirma (ve uygulama )?merkezi|\btip\b|muhendislig"
    # Sik universite kisaltmalari (katlanmis): ITU, YTU, ODTU, BAU, MSGSU, FSMVU, IKU.
    r"|\b(itu|ytu|odtu|metu|bau|msgsu|fsmvu|iku)\b"
    r"|جامع"  # Arapca "universite" (camia / camiiyye)
)
_SCHOOL_BY_NAME = [
    (re.compile(r"\bkolej|\bcollege\b"), "college_keyword"),
    (re.compile(r"\blise(si)?\b|high school|\blycee"), "high_school"),
    (re.compile(r"\bortaokul|middle school"), "middle_school"),
    (re.compile(r"\bilkokul|\bilkogretim|\bi\.?o\.? ?o\b|primary school|elementary school"), "primary_school"),
    (re.compile(r"\banaokul|\bkres\b|kindergarten|preschool"), "kindergarten"),
    (re.compile(r"dil okul|dil kurs|language|\bingilizce|\benglish\b|kultur dernegi|ingiliz kultur|\btomer\b"), "language_school"),
    # Kademesi yazmayan okul ("... Okullari", "Egitim Kurumlari"): ozel okul.
    (re.compile(r"\bokul(u|lari)?\b|egitim kurumlari|\bschools?\b"), "private_school"),
]


def refine_university(name: str | None) -> Optional[str]:
    """
    Overture'in universite dedigi kaydin gercek turu. Bakirkoy'de 58 kaydin
    ~25'i universiteydi; gerisi lise, kolej, mahkeme, mezarlik, firma.
    Universite isareti yoksa okul turune, o da yoksa siniflandirilamayana (None).
    """
    folded = ascii_fold(name or "")
    if not folded.strip():
        return None
    if _UNIVERSITY.search(folded):
        return "college_university"
    for pattern, place_type in _SCHOOL_BY_NAME:
        if pattern.search(folded):
            return place_type
    return None


def tr_fold(text: str) -> str:
    """
    Turkce duyarli kucuk harfe cevirme.

    Python'da "I".casefold() -> "i" + U+0307 (birlesik nokta) uretir:

        "Ataturk Ilkokulu".casefold() == "ataturk i̇lkokulu"

    Bu yuzden "ilkokul" anahtar kelimesi eslesmiyordu. Turkiye'de okul
    adlarinin buyuk cogunlugu buyuk I ile yazildigi (Ilkokulu, Ilkogretim)
    icin isim tabanli siniflandirma bu adlarda sessizce devre disi
    kaliyordu; "Ortaokulu" ve "Lisesi" ise etkilenmedigi icin sorun
    yalnizca bazi kategorilerde goze carpiyordu.

    Her iki Turkce buyuk I de noktali "i" ye esleniyor: anahtar
    kelimeler ASCII yazildigi icin eslesme amacli dogru davranis bu.
    """
    return (text or "").replace("İ", "i").replace("I", "i").casefold()


def classify_school_level(tags: dict, name: str) -> Optional[str]:
    """
    Classify school level using tags and Turkish name heuristics.

    Priority:
    1. ISCED/education tags
    2. Name-based keywords (case-insensitive, Turkish-focused)

    Returns:
    - "kindergarten", "primary_school", "middle_school", "high_school",
      "private_school", or "college_keyword"
    - None if no match
    """
    # Check if it's a kindergarten first (different amenity tag)
    if tags.get("amenity") == "kindergarten":
        return "kindergarten"

    # Yuksekogretim de ayri bir amenity tasiyor ve bu kontrol asagidaki
    # erken cikistan ONCE gelmeli. Onceden universite dali fonksiyonun
    # ilerisindeydi, ama amenity != "school" kontrolu oraya varmadan
    # None donduruyordu: dal ulasilamaz koddu ve universiteler hicbir
    # zaman siniflandirilamiyordu. (craft/workshop hatasinin ayni sekli.)
    if tags.get("amenity") == "university":
        return "college_university"
    if tags.get("amenity") == "college":
        # Turkiye'de "Kolej" ozel K-12 okulu ve OSM'de amenity=college diye
        # isaretleniyor. Ad acikca okul diyorsa o tur; yoksa yuksekogretim.
        refined = refine_university(name)
        return refined if refined not in (None, "college_university") else "college_university"

    # Not a school amenity
    if tags.get("amenity") != "school":
        return None

    # Priority 1: Use ISCED/education tags if present
    isced_level = tags.get("isced:level", "")
    school_level = tags.get("school:level", "")

    # ISCED mapping:
    # 0 = Pre-primary (kindergarten)
    # 1 = Primary
    # 2 = Lower secondary (middle school)
    # 3 = Upper secondary (high school)
    if isced_level:
        if "0" in isced_level:
            return "kindergarten"
        elif "1" in isced_level:
            return "primary_school"
        elif "2" in isced_level:
            return "middle_school"
        elif "3" in isced_level:
            return "high_school"

    if school_level:
        level_lower = school_level.lower()
        if "primary" in level_lower or "ilkokul" in level_lower:
            return "primary_school"
        elif "middle" in level_lower or "ortaokul" in level_lower:
            return "middle_school"
        elif "secondary" in level_lower or "lise" in level_lower:
            return "high_school"

    # Check for private school indicators in tags
    is_private = (
        tags.get("operator:type") == "private"
        or tags.get("school:type") == "private"
        or "özel" in tr_fold(tags.get("operator", ""))
    )

    # Priority 2: Name-based heuristics (case-insensitive, Turkish casefold)
    name_lower = tr_fold(name)
    official_name_lower = tr_fold(tags.get("official_name", ""))
    combined_name = f"{name_lower} {official_name_lower}"

    # Not: amenity=university|college kontrolu yukari, erken cikistan
    # once tasindi. Burada tekrarlamak olu kod olurdu.

    # Adinda "kolej" gecen okullar. Turkiye'de kolej cogunlukla ozel bir
    # K-12 okulu demek, universite degil; bu yuzden ayri bir tur.
    # Onceden bunlar da "college_university" donuyordu, oysa arama
    # filtresi `classified == place_type` karsilastirdigi icin
    # "college_keyword" kategorisi hicbir zaman sonuc veremiyordu.
    college_keywords = ["kolej", "koleji", "college"]
    if any(keyword in combined_name for keyword in college_keywords):
        return "college_keyword"

    # Check for private school indicators
    private_keywords = ["özel", "private"]
    if is_private or any(keyword in combined_name for keyword in private_keywords):
        return "private_school"

    # School level keywords with priority order
    # Priority: primary > middle > high (if multiple matches)
    primary_keywords = ["ilkokul", "primary"]
    middle_keywords = ["ortaokul", "middle school"]
    high_keywords = [
        "lise",
        "anatolian",
        "anadolu lisesi",
        "fen lisesi",
        "mesleki",
        "meslek lisesi",
        "vocational",
        "high school",
    ]

    # Check in priority order
    if any(keyword in combined_name for keyword in primary_keywords):
        return "primary_school"
    elif any(keyword in combined_name for keyword in middle_keywords):
        return "middle_school"
    elif any(keyword in combined_name for keyword in high_keywords):
        return "high_school"

    # No classification possible - return None
    return None


def classify_b2b_type(tags: dict, element_type: str) -> Optional[str]:
    """
    Classify B2B place type (factory, office, workshop).

    Args:
        tags: OSM element tags
        element_type: OSM element type (node, way, relation)

    Returns:
        "factory", "office", "workshop", or None
    """
    # Factory indicators
    industrial_tag = tags.get("industrial")
    man_made_tag = tags.get("man_made")
    building_tag = tags.get("building")
    landuse_tag = tags.get("landuse")

    # Workshop once kontrol ediliyor: industrial=workshop hem bu kosulu
    # hem de asagidaki fabrika kosulunu (industrial_tag dolu) sagliyor.
    # Fabrika kontrolu once oldugu icin workshop dali ulasilamaz kod
    # durumundaydi ve atolyeler fabrika olarak siniflandiriliyordu.
    craft_tag = tags.get("craft")
    if craft_tag or industrial_tag == "workshop":
        return "workshop"

    # building=warehouse ve building=office ingest'in b2b ailesinde
    # cekiliyor (ingest.py SELECTOR_FAMILIES) ama burada karsiligi yoktu;
    # o kayitlar place_type=NULL ile saklanip filtrelerde gizleniyordu.
    # Depo bir sanayi/lojistik tesisi oldugu icin fabrika tarafinda.
    if (
        industrial_tag
        or man_made_tag == "works"
        or building_tag in ("industrial", "warehouse")
        or landuse_tag == "industrial"
    ):
        return "factory"

    # Office indicators
    # building=office icin de ayni bosluk vardi; bkz. yukaridaki not.
    office_tag = tags.get("office")
    if office_tag or building_tag in ("commercial", "office"):
        return "office"

    return None


# Hizmet turleri. Holding disindakiler etiketten okunuyor; holding icin
# ne OSM'de ne Overture'da kategori var, adiyla taninir (Kolej'deki
# isim-anahtar kelime kalibi).
HOTEL_TOURISM = {"hotel", "hostel", "motel", "guest_house", "resort"}
COMPANY_OFFICE = {"company", "it", "telecommunication", "energy_supplier"}
TRAVEL_OFFICE = {"travel_agent", "travel_agency"}
SERVICE_TYPES = frozenset(
    {
        "hotel",
        "company",
        "holding",
        "real_estate",
        "language_school",
        "travel_agency",
        # Gezi & eglence: kultur ve doga kurumlari da degisim ortagi.
        "zoo_aquarium",
        "theme_park",
        "museum",
        "botanical_garden",
        "nature_park",
    }
)


def is_holding_name(name: str) -> bool:
    return "holding" in tr_fold(name or "")


def classify_service_type(tags: dict, name: str) -> Optional[str]:
    """
    hotel | company | holding | real_estate | language_school |
    travel_agency | None.

    B2B siniflandirmasindan ONCE cagrilmali: office=estate_agent gibi
    etiketler aksi halde genel `office` dalina dusuyor.
    """
    if is_holding_name(name):
        return "holding"
    if tags.get("tourism") in HOTEL_TOURISM:
        return "hotel"
    office = tags.get("office")
    if office == "estate_agent":
        return "real_estate"
    if office in TRAVEL_OFFICE or tags.get("shop") == "travel_agency":
        return "travel_agency"
    if office in COMPANY_OFFICE:
        return "company"
    if tags.get("amenity") == "language_school":
        return "language_school"
    tourism = tags.get("tourism")
    leisure = tags.get("leisure")
    if tourism in ("zoo", "aquarium"):
        return "zoo_aquarium"
    if tourism == "theme_park" or leisure == "water_park":
        return "theme_park"
    if tourism == "museum":
        return "museum"
    if leisure == "garden" and tags.get("garden:type") == "botanical":
        return "botanical_garden"
    if tags.get("boundary") == "national_park" or leisure == "nature_reserve":
        return "nature_park"
    return None


def has_name(tags: dict) -> bool:
    """Check if element has a name tag."""
    return bool(tags.get("name") or tags.get("official_name"))
