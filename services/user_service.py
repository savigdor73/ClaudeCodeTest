from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.user import User, AuditLog
from services.auth_service import hash_password
import uuid


async def get_all_users(db: AsyncSession, skip: int = 0, limit: int = 100) -> tuple[list[User], int]:
    count_result = await db.execute(select(func.count()).select_from(User))
    total = count_result.scalar_one()

    result = await db.execute(select(User).offset(skip).limit(limit).order_by(User.created_at.desc()))
    users = list(result.scalars().all())
    return users, total


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    email: str,
    full_name: str,
    password: str,
    role: str,
    created_by_id: str,
) -> User:
    from services.auth_service import get_user_by_email
    existing = await get_user_by_email(db, email)
    if existing:
        raise ValueError("Email already registered")

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
        user_id=created_by_id,
        action="create_user",
        resource="user",
        details={"target_email": email, "role": role},
    )
    db.add(log)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(
    db: AsyncSession,
    user_id: str,
    updated_by_id: str,
    full_name: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    password: Optional[str] = None,
    theme: Optional[str] = None,
) -> Optional[User]:
    user = await get_user_by_id(db, user_id)
    if not user:
        return None

    changes = {}
    if full_name is not None:
        user.full_name = full_name
        changes["full_name"] = full_name
    if role is not None:
        user.role = role
        changes["role"] = role
    if is_active is not None:
        user.is_active = is_active
        changes["is_active"] = is_active
    if password is not None:
        user.hashed_password = hash_password(password)
        changes["password"] = "changed"
    if theme is not None:
        user.theme = theme
        changes["theme"] = theme

    log = AuditLog(
        user_id=updated_by_id,
        action="update_user",
        resource="user",
        details={"target_id": user_id, "changes": changes},
    )
    db.add(log)
    await db.commit()
    await db.refresh(user)
    return user


async def soft_delete_user(db: AsyncSession, user_id: str, deleted_by_id: str) -> bool:
    user = await get_user_by_id(db, user_id)
    if not user:
        return False

    user.is_active = False

    log = AuditLog(
        user_id=deleted_by_id,
        action="deactivate_user",
        resource="user",
        details={"target_id": user_id},
    )
    db.add(log)
    await db.commit()
    return True
