import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import get_settings
from database import get_db
from middleware.auth_middleware import get_current_user
from models.user import User
from models.subscription import Subscription
from schemas.billing import CheckoutRequest
from services import billing_service

settings = get_settings()

router = APIRouter(prefix="/api/billing", tags=["billing"])
logger = logging.getLogger(__name__)


def _ok(data, message: str = "OK") -> dict:
    return {"success": True, "message": message, "data": data}


@router.post("/checkout")
async def create_checkout(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
):
    price_map = billing_service.get_price_map()
    if body.price_id not in price_map:
        raise HTTPException(status_code=400, detail="Invalid price_id")
    return _ok({"price_id": body.price_id, "user_id": current_user.id}, "Price validated")


@router.post("/webhook")
async def webhook(request: Request, db: AsyncSession = Depends(get_db)):
    raw_body = await request.body()
    sig = request.headers.get("Paddle-Signature", "")

    if not billing_service.verify_webhook_signature(raw_body, sig):
        return Response(status_code=401)

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(status_code=400)

    event_type = payload.get("event_type", "")
    supported = {"subscription.created", "subscription.updated"}
    if event_type not in supported:
        return {"ok": True}

    data = payload.get("data", {})
    try:
        await billing_service.handle_webhook(db, event_type, data, payload)
    except Exception:
        logger.exception("Webhook processing error for event %s", event_type)

    return {"ok": True}


@router.get("/config")
async def billing_config():
    return _ok({
        "client_token": settings.paddle_client_token,
        "environment": settings.paddle_environment,
        "prices": {
            "basic_monthly": billing_service.get_price_id("basic", "monthly"),
            "basic_yearly":  billing_service.get_price_id("basic", "yearly"),
            "pro_monthly":   billing_service.get_price_id("pro",   "monthly"),
            "pro_yearly":    billing_service.get_price_id("pro",   "yearly"),
        }
    }, "Billing config")


@router.get("/status")
async def billing_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == current_user.id)
        .order_by(Subscription.created_at.desc())
    )
    sub = result.scalar_one_or_none()

    return _ok({
        "plan": current_user.plan,
        "subscription_status": current_user.subscription_status,
        "renews_at": sub.renews_at.isoformat() if sub and sub.renews_at else None,
        "ends_at": sub.ends_at.isoformat() if sub and sub.ends_at else None,
    }, "Billing status retrieved")
