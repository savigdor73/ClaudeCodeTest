from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth_middleware import get_current_user
from models.user import User
from schemas.auth import (
    LoginRequest, LoginResponse, RegisterRequest,
    TokenRefreshRequest, TokenRefreshResponse, UserProfileResponse,
)
from services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _ok(data: dict, message: str = "OK") -> dict:
    return {"success": True, "message": message, "data": data}


def _err(message: str, code: int = 400):
    raise HTTPException(status_code=code, detail={"success": False, "message": message, "data": None})


@router.post("/register", response_model=None)
async def register(
    body: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Check if this is the first user (open registration) or admin-only
    total = await auth_service.count_users(db)
    if total > 0:
        # Require admin token for subsequent registrations
        from fastapi.security import HTTPBearer
        from jose import JWTError
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"success": False, "message": "Only admins can register new users", "data": None},
            )
        token = auth_header.split(" ", 1)[1]
        try:
            payload = auth_service.decode_token(token)
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"success": False, "message": "Invalid token", "data": None},
            )
        if payload.get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"success": False, "message": "Only admins can register new users", "data": None},
            )

    existing = await auth_service.get_user_by_email(db, body.email)
    if existing:
        _err("Email already registered")

    user = await auth_service.register_user(
        db,
        email=body.email,
        full_name=body.full_name,
        password=body.password,
        role=body.role,
    )
    return _ok(
        {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role},
        "User registered successfully",
    )


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    try:
        user, access_token, refresh_token = await auth_service.login_user(
            db, body.email, body.password, ip_address=ip, user_agent=ua
        )
    except ValueError as e:
        _err(str(e), 401)

    return _ok(
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
            },
        },
        "Login successful",
    )


@router.post("/logout")
async def logout(
    body: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await auth_service.logout_user(db, body.refresh_token, current_user.id)
    return _ok({}, "Logged out successfully")


@router.post("/refresh", response_model=TokenRefreshResponse)
async def refresh(body: TokenRefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        access_token, refresh_token = await auth_service.refresh_access_token(db, body.refresh_token)
    except ValueError as e:
        _err(str(e), 401)

    return _ok(
        {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"},
        "Token refreshed",
    )


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return _ok(
        {
            "id": current_user.id,
            "email": current_user.email,
            "full_name": current_user.full_name,
            "role": current_user.role,
            "is_active": current_user.is_active,
            "created_at": current_user.created_at.isoformat(),
            "last_login": current_user.last_login.isoformat() if current_user.last_login else None,
        },
        "Profile retrieved",
    )
