from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/smallbizhub"
    jwt_secret_key: str = "change-this-secret-key-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    first_admin_email: str = "admin@example.com"
    first_admin_password: str = "changeme123"
    paddle_api_key: str = ""
    paddle_client_token: str = ""
    paddle_webhook_secret: str = ""
    paddle_environment: str = "sandbox"  # "sandbox" or "production"
    paddle_price_basic_monthly: str = ""
    paddle_price_basic_yearly: str = ""
    paddle_price_pro_monthly: str = ""
    paddle_price_pro_yearly: str = ""

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
