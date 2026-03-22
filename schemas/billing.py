from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class CheckoutRequest(BaseModel):
    price_id: str


class CheckoutResponse(BaseModel):
    success: bool = True
    message: str = "Checkout URL created"
    data: dict


class BillingStatusResponse(BaseModel):
    success: bool = True
    message: str = "Billing status retrieved"
    data: dict
