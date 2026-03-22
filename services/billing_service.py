import hashlib
import hmac
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models.user import User, AuditLog
from models.subscription import Subscription

settings = get_settings()
logger = logging.getLogger(__name__)

PRICE_PLAN_MAP: dict[str, tuple[str, str]] = {}


def _paddle_base_url() -> str:
    if settings.paddle_environment == "sandbox":
        return "https://sandbox-api.paddle.com"
    return "https://api.paddle.com"


def _build_price_map() -> dict[str, tuple[str, str]]:
    return {
        v: plan
        for v, plan in [
            (settings.paddle_price_basic_monthly, ("basic", "monthly")),
            (settings.paddle_price_basic_yearly, ("basic", "yearly")),
            (settings.paddle_price_pro_monthly, ("pro", "monthly")),
            (settings.paddle_price_pro_yearly, ("pro", "yearly")),
        ]
        if v
    }


def get_price_id(plan: str, billing_anchor: str) -> str:
    attr = f"paddle_price_{plan}_{billing_anchor}"
    return getattr(settings, attr, "")


def get_price_map() -> dict[str, tuple[str, str]]:
    global PRICE_PLAN_MAP
    if not PRICE_PLAN_MAP:
        PRICE_PLAN_MAP = _build_price_map()
    return PRICE_PLAN_MAP


def verify_webhook_signature(raw_body: bytes, signature_header: str) -> bool:
    """
    Paddle-Signature header format: ts=<unix_timestamp>;h1=<hmac_sha256_hex>
    Signed payload: "<ts>:<raw_body>"
    """
    parts: dict[str, str] = {}
    for part in signature_header.split(";"):
        if "=" in part:
            key, val = part.split("=", 1)
            parts[key.strip()] = val.strip()

    ts = parts.get("ts", "")
    h1 = parts.get("h1", "")
    if not ts or not h1:
        return False

    signed_payload = f"{ts}:{raw_body.decode('utf-8')}"
    expected = hmac.new(
        settings.paddle_webhook_secret.encode(),
        signed_payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, h1)


async def get_checkout_url(user: User, price_id: str) -> str:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"{_paddle_base_url()}/transactions",
            headers={
                "Authorization": f"Bearer {settings.paddle_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "items": [{"price_id": price_id, "quantity": 1}],
                "customer": {"email": user.email},
                "custom_data": {"user_id": user.id},
            },
        )
    if response.status_code not in (200, 201):
        logger.error("Paddle checkout error: %s %s", response.status_code, response.text)
        raise ValueError(f"Paddle returned {response.status_code}")
    return response.json()["data"]["checkout"]["url"]


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def _extract_user_id(data: dict) -> Optional[str]:
    custom = data.get("custom_data") or {}
    if isinstance(custom, dict):
        uid = custom.get("user_id")
        if uid:
            return str(uid)
    return None


def _extract_price_id(data: dict) -> str:
    items = data.get("items") or []
    if items:
        return items[0].get("price", {}).get("id", "")
    return ""


def _extract_billing_anchor(data: dict) -> str:
    items = data.get("items") or []
    if items:
        interval = items[0].get("price", {}).get("billing_cycle", {}).get("interval", "month")
        return "yearly" if interval == "year" else "monthly"
    return "monthly"


async def handle_webhook(db: AsyncSession, event_type: str, data: dict, raw_payload: dict) -> None:
    """
    Paddle event types routed here:
      subscription.created  → activate subscription
      subscription.updated  → update status; detect cancellation schedule or full cancellation
    """
    if event_type == "subscription.created":
        await _handle_subscription_created(db, data, raw_payload)
    elif event_type == "subscription.updated":
        status = data.get("status", "active")
        scheduled = data.get("scheduled_change") or {}
        if status == "canceled":
            await _handle_subscription_expired(db, data, raw_payload)
        elif scheduled.get("action") == "cancel":
            await _handle_subscription_cancelled(db, data, raw_payload)
        else:
            await _handle_subscription_updated(db, data, raw_payload)


async def _handle_subscription_created(db: AsyncSession, data: dict, raw_payload: dict) -> None:
    price_id = _extract_price_id(data)
    price_map = get_price_map()
    plan, billing_anchor = price_map.get(price_id, ("basic", "monthly"))

    user_id = _extract_user_id(data)
    if not user_id:
        logger.error("subscription.created: no user_id in custom_data")
        return

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        logger.error("subscription.created: user %s not found", user_id)
        return

    paddle_sub_id = str(data.get("id", ""))
    paddle_cust_id = str(data.get("customer_id", ""))
    paddle_txn_id = str(data.get("transaction_id", "")) or None

    existing = await db.execute(
        select(Subscription).where(Subscription.paddle_subscription_id == paddle_sub_id)
    )
    sub = existing.scalar_one_or_none()
    if sub is None:
        sub = Subscription(
            id=str(uuid.uuid4()),
            user_id=user_id,
            paddle_subscription_id=paddle_sub_id,
            paddle_customer_id=paddle_cust_id,
            paddle_transaction_id=paddle_txn_id,
            plan=plan,
            price_id=price_id,
            status="active",
            billing_anchor=billing_anchor,
            renews_at=_parse_datetime(data.get("next_billed_at")),
            ends_at=None,
            trial_ends_at=_parse_datetime(data.get("trial_dates", {}).get("ends_at") if isinstance(data.get("trial_dates"), dict) else None),
            raw_event=raw_payload,
        )
        db.add(sub)
    else:
        sub.status = "active"
        sub.updated_at = datetime.now(timezone.utc)
        sub.raw_event = raw_payload

    user.plan = plan
    user.subscription_status = "active"
    user.paddle_customer_id = paddle_cust_id
    user.paddle_subscription_id = paddle_sub_id

    db.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        action="subscription_created",
        resource="subscription",
        details={"plan": plan, "paddle_subscription_id": paddle_sub_id},
    ))
    await db.commit()


async def _handle_subscription_updated(db: AsyncSession, data: dict, raw_payload: dict) -> None:
    paddle_sub_id = str(data.get("id", ""))
    result = await db.execute(
        select(Subscription).where(Subscription.paddle_subscription_id == paddle_sub_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        logger.warning("subscription.updated: subscription %s not found, treating as created", paddle_sub_id)
        await _handle_subscription_created(db, data, raw_payload)
        return

    price_id = _extract_price_id(data) or sub.price_id
    price_map = get_price_map()
    plan, billing_anchor = price_map.get(price_id, (sub.plan, sub.billing_anchor))
    paddle_status = data.get("status", "active")

    sub.plan = plan
    sub.price_id = price_id
    sub.billing_anchor = billing_anchor
    sub.status = paddle_status
    sub.renews_at = _parse_datetime(data.get("next_billed_at"))
    sub.updated_at = datetime.now(timezone.utc)
    sub.raw_event = raw_payload

    result2 = await db.execute(select(User).where(User.id == sub.user_id))
    user = result2.scalar_one_or_none()
    if user:
        user.plan = plan
        user.subscription_status = paddle_status

    await db.commit()


async def _handle_subscription_cancelled(db: AsyncSession, data: dict, raw_payload: dict) -> None:
    """User has scheduled cancellation — still has access until effective_at."""
    paddle_sub_id = str(data.get("id", ""))
    result = await db.execute(
        select(Subscription).where(Subscription.paddle_subscription_id == paddle_sub_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        return

    scheduled = data.get("scheduled_change") or {}
    effective_at = _parse_datetime(scheduled.get("effective_at"))

    sub.status = "cancelled"
    sub.ends_at = effective_at
    sub.updated_at = datetime.now(timezone.utc)
    sub.raw_event = raw_payload

    result2 = await db.execute(select(User).where(User.id == sub.user_id))
    user = result2.scalar_one_or_none()
    if user:
        user.subscription_status = "cancelled"
        db.add(AuditLog(
            id=str(uuid.uuid4()),
            user_id=user.id,
            action="subscription_cancelled",
            resource="subscription",
            details={"paddle_subscription_id": paddle_sub_id, "ends_at": str(sub.ends_at)},
        ))

    await db.commit()


async def _handle_subscription_expired(db: AsyncSession, data: dict, raw_payload: dict) -> None:
    """Subscription is fully canceled — revoke access."""
    paddle_sub_id = str(data.get("id", ""))
    result = await db.execute(
        select(Subscription).where(Subscription.paddle_subscription_id == paddle_sub_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        return

    sub.status = "expired"
    sub.ends_at = _parse_datetime(data.get("canceled_at")) or sub.ends_at
    sub.updated_at = datetime.now(timezone.utc)
    sub.raw_event = raw_payload

    result2 = await db.execute(select(User).where(User.id == sub.user_id))
    user = result2.scalar_one_or_none()
    if user:
        user.plan = "free"
        user.subscription_status = "expired"
        db.add(AuditLog(
            id=str(uuid.uuid4()),
            user_id=user.id,
            action="subscription_expired",
            resource="subscription",
            details={"paddle_subscription_id": paddle_sub_id},
        ))

    await db.commit()
