import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt as _bcrypt
from jose import JWTError, jwt
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models.user import User, AuditLog
from models.session import UserSession

settings = get_settings()


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return _bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def create_access_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user: User) -> tuple[str, datetime]:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
        "exp": expire,
        "type": "refresh",
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, expire


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def count_users(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(User))
    return result.scalar_one()


async def register_user(
    db: AsyncSession,
    email: str,
    full_name: str,
    password: str,
    role: str = "staff",
) -> User:
    total = await count_users(db)
    if total == 0:
        role = "admin"  # First user becomes admin

    user = User(
        id=str(uuid.uuid4()),
        email=email,
        full_name=full_name,
        hashed_password=hash_password(password),
        role=role,
    )
    db.add(user)
    await db.flush()

    log = AuditLog(
        user_id=user.id,
        action="register",
        resource="user",
        details={"email": email, "role": role},
    )
    db.add(log)
    await db.commit()
    await db.refresh(user)
    return user


async def login_user(
    db: AsyncSession,
    email: str,
    password: str,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> tuple[User, str, str]:
    user = await get_user_by_email(db, email)
    if not user or not user.is_active:
        raise ValueError("Invalid credentials")
    if not verify_password(password, user.hashed_password):
        raise ValueError("Invalid credentials")

    access_token = create_access_token(user)
    refresh_token, expires_at = create_refresh_token(user)

    session = UserSession(
        id=str(uuid.uuid4()),
        user_id=user.id,
        token_hash=hash_token(refresh_token),
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(session)

    user.last_login = datetime.now(timezone.utc)

    log = AuditLog(
        user_id=user.id,
        action="login",
        resource="session",
        details={"ip": ip_address},
    )
    db.add(log)
    await db.commit()
    await db.refresh(user)
    return user, access_token, refresh_token


async def logout_user(db: AsyncSession, refresh_token: str, user_id: str) -> bool:
    token_hash = hash_token(refresh_token)
    result = await db.execute(
        select(UserSession).where(
            UserSession.token_hash == token_hash,
            UserSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return False

    await db.delete(session)

    log = AuditLog(
        user_id=user_id,
        action="logout",
        resource="session",
        details=None,
    )
    db.add(log)
    await db.commit()
    return True


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> tuple[str, str]:
    try:
        payload = decode_token(refresh_token)
    except JWTError:
        raise ValueError("Invalid refresh token")

    if payload.get("type") != "refresh":
        raise ValueError("Invalid token type")

    token_hash = hash_token(refresh_token)
    result = await db.execute(
        select(UserSession).where(UserSession.token_hash == token_hash)
    )
    db_session = result.scalar_one_or_none()
    if not db_session:
        raise ValueError("Session not found or expired")

    user = await get_user_by_id(db, payload["user_id"])
    if not user or not user.is_active:
        raise ValueError("User not found or inactive")

    # Rotate tokens
    await db.delete(db_session)

    new_access = create_access_token(user)
    new_refresh, expires_at = create_refresh_token(user)

    import uuid as _uuid
    new_session = UserSession(
        id=str(_uuid.uuid4()),
        user_id=user.id,
        token_hash=hash_token(new_refresh),
        expires_at=expires_at,
        ip_address=db_session.ip_address,
        user_agent=db_session.user_agent,
    )
    db.add(new_session)
    await db.commit()
    return new_access, new_refresh
