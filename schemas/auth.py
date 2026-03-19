from pydantic import BaseModel, EmailStr
from datetime import datetime


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    success: bool = True
    message: str = "Login successful"
    data: dict


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: str = "staff"


class TokenRefreshRequest(BaseModel):
    refresh_token: str


class TokenRefreshResponse(BaseModel):
    success: bool = True
    message: str = "Token refreshed"
    data: dict


class UserProfileResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    last_login: datetime | None

    class Config:
        from_attributes = True
