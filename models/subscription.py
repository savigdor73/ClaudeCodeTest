import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    paddle_subscription_id: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    paddle_customer_id: Mapped[str] = mapped_column(String(50), nullable=False)
    paddle_transaction_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    plan: Mapped[str] = mapped_column(String(20), nullable=False)  # "basic" or "pro"
    price_id: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    billing_anchor: Mapped[str] = mapped_column(String(10), nullable=False)  # "monthly" or "yearly"
    renews_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    raw_event: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="subscriptions")  # noqa: F821
