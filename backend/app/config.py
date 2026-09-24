from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode


class Settings(BaseSettings):
    overpass_api_url: str = "https://overpass-api.de/api/interpreter"

    # NoDecode + asagidaki validator: pydantic-settings varsayilan
    # olarak list tipli alanlari .env'den JSON olarak parse etmeye
    # calisir. Bu projede coklu deger tasiyan her env degiskeni
    # (OVERPASS_URLS, .env.example'daki CORS_ORIGINS ornegi) virgulle
    # ayrilmis duz metin - JSON degil. NoDecode olmadan, bu alani
    # okuyan ilk import (Settings()) gercek bir .env dosyasi karsisinda
    # (CORS_ORIGINS=a,b,c gibi) SettingsError ile patlar. Bu alan su an
    # hicbir yerde okunmuyor (main.py CORS listesini sabit veriyor),
    # yani burda davranis degisikligi yok - sadece import guvenli hale
    # geliyor.
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://localhost:3001",
    ]
    port: int = 8000

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _cors_origins_virgulle_ayir(cls, v):
        """OVERPASS_URLS ile ayni konvansiyon: virgulle ayrilmis metin."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # Yerel kullanim modu.
    #
    # Kota/plan sistemi (free/pro/enterprise, daily_limit, UpgradeModal,
    # export kilidi) ticari kullanim icin yazildi. Yerelde calisan bir
    # aracta bu sadece surtunme: kullanici arama yapabilmek icin admin
    # ucundan anahtar uretmek zorunda kaliyor.
    #
    # true: X-API-KEY zorunlu degil, kota sayaci islemez, export serbest.
    # false (varsayilan): mevcut davranis aynen gecerli.
    local_mode: bool = False

    class Config:
        env_file = ".env"
        case_sensitive = False
        # BaseSettings varsayilani "forbid": .env'de bu sinifin
        # tanimlamadigi bir anahtar (OVERPASS_URLS, ADMIN_API_KEY,
        # OVERPASS_TIMEOUT - bunlar bilerek os.getenv() ile ayrica
        # okunuyor) gecince Settings() ValidationError ile patlar.
        # "ignore" olmadan, bu alani okuyan ilk import gercek .env
        # dosyasiyla ayni sekilde patlardi.
        extra = "ignore"


settings = Settings()
