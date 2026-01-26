from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    overpass_api_url: str = "https://overpass-api.de/api/interpreter"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]
    port: int = 8000
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
