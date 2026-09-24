"""Router for search parameter presets."""

from fastapi import APIRouter

from app.models import RADIUS_PRESETS, PresetResponse

router = APIRouter()


@router.get("/presets", response_model=PresetResponse)
async def get_search_presets():
    """
    Get recommended search parameters and UI labels for different place types.
    Aligns client UI with the unified search policy engine.
    """
    return PresetResponse(
        max_radius=5000,
        default_by_type=RADIUS_PRESETS,
        radius_options=[500, 1000, 1500, 2000, 2500, 3000, 5000],
        default_mode="auto",
        notes="auto selects 'around' for schools and 'bbox' for B2B by default",
        type_labels_tr={
            "factory": "Fabrika",
            "office": "Ofis",
            "workshop": "Atölye / İmalathane",
            "kindergarten": "Anaokulu",
            "primary_school": "İlkokul",
            "middle_school": "Ortaokul",
            "high_school": "Lise",
            "private_school": "Özel Okul",
            "college_keyword": "Kolej",
            "college_university": "Üniversite",
            "hotel": "Otel",
            "company": "Şirket",
            "holding": "Holding",
            "real_estate": "Emlak Ofisi",
            "language_school": "Dil Kursu",
            "travel_agency": "Seyahat Acentesi",
            "zoo_aquarium": "Hayvanat Bahçesi & Akvaryum",
            "theme_park": "Tema & Su Parkı",
            "museum": "Müze",
            "botanical_garden": "Botanik Bahçesi",
            "nature_park": "Milli Park & Doğa Alanı",
        },
        type_groups_tr=[
            {
                "group": "İşletmeler",
                "types": ["factory", "company", "holding", "office", "workshop"],
            },
            {
                "group": "Eğitim Kurumları",
                "types": [
                    "kindergarten",
                    "primary_school",
                    "middle_school",
                    "high_school",
                    "private_school",
                    "college_keyword",
                    "college_university",
                    "language_school",
                ],
            },
            {
                "group": "Konaklama & Hizmet",
                "types": ["hotel", "real_estate", "travel_agency"],
            },
            {
                "group": "Gezi & Eğlence",
                "types": [
                    "zoo_aquarium",
                    "theme_park",
                    "museum",
                    "botanical_garden",
                    "nature_park",
                ],
            },
        ],
    )
