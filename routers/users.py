from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone

from database import get_db
from middleware.auth_middleware import get_current_user, require_admin
from models.user import User
from models.session import UserSession
from schemas.user import UserCreate, UserUpdate
from services import user_service

router = APIRouter(prefix="/api", tags=["users"])


def _ok(data, message: str = "OK") -> dict:
    return {"success": True, "message": message, "data": data}


def _err(message: str, code: int = 400):
    raise HTTPException(status_code=code, detail={"success": False, "message": message, "data": None})


@router.get("/users")
async def list_users(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    users, total = await user_service.get_all_users(db, skip=skip, limit=limit)
    return _ok(
        {
            "users": [
                {
                    "id": u.id,
                    "email": u.email,
                    "full_name": u.full_name,
                    "role": u.role,
                    "is_active": u.is_active,
                    "created_at": u.created_at.isoformat(),
                    "last_login": u.last_login.isoformat() if u.last_login else None,
                }
                for u in users
            ],
            "total": total,
        },
        "Users retrieved",
    )


@router.post("/users")
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    try:
        user = await user_service.create_user(
            db,
            email=body.email,
            full_name=body.full_name,
            password=body.password,
            role=body.role,
            created_by_id=current_user.id,
        )
    except ValueError as e:
        _err(str(e))

    return _ok(
        {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role},
        "User created",
    )


@router.get("/users/{user_id}")
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Users can only view their own profile unless they are admin
    if current_user.role != "admin" and current_user.id != user_id:
        _err("Access denied", 403)

    user = await user_service.get_user_by_id(db, user_id)
    if not user:
        _err("User not found", 404)

    return _ok(
        {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat(),
            "last_login": user.last_login.isoformat() if user.last_login else None,
        },
        "User retrieved",
    )


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Non-admins can only update their own profile (and can't change role)
    if current_user.role != "admin" and current_user.id != user_id:
        _err("Access denied", 403)
    if current_user.role != "admin" and body.role is not None:
        _err("Only admins can change roles", 403)

    user = await user_service.update_user(
        db,
        user_id=user_id,
        updated_by_id=current_user.id,
        full_name=body.full_name,
        role=body.role,
        is_active=body.is_active,
        password=body.password,
    )
    if not user:
        _err("User not found", 404)

    return _ok(
        {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role},
        "User updated",
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if current_user.id == user_id:
        _err("Cannot deactivate your own account")

    success = await user_service.soft_delete_user(db, user_id, current_user.id)
    if not success:
        _err("User not found", 404)

    return _ok({}, "User deactivated")


@router.get("/dashboard/stats")
async def dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_users_result = await db.execute(select(func.count()).select_from(User))
    total_users = total_users_result.scalar_one()

    active_users_result = await db.execute(
        select(func.count()).select_from(User).where(User.is_active == True)  # noqa: E712
    )
    active_users = active_users_result.scalar_one()

    active_sessions_result = await db.execute(
        select(func.count()).select_from(UserSession).where(
            UserSession.expires_at > datetime.now(timezone.utc)
        )
    )
    active_sessions = active_sessions_result.scalar_one()

    recent_logins_result = await db.execute(
        select(User)
        .where(User.last_login.isnot(None))
        .order_by(User.last_login.desc())
        .limit(10)
    )
    recent_logins = [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "last_login": u.last_login.isoformat(),
        }
        for u in recent_logins_result.scalars().all()
    ]

    return _ok(
        {
            "total_users": total_users,
            "active_users": active_users,
            "active_sessions": active_sessions,
            "recent_logins": recent_logins,
        },
        "Stats retrieved",
    )
