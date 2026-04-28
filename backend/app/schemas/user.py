"""
MedicX — User Schemas (Pydantic)
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from app.models.user import UserRole


# ─── Auth ───────────────────────────────────────────────
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole = UserRole.TECHNICIAN


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class TokenData(BaseModel):
    user_id: str
    role: UserRole


# ─── User CRUD ──────────────────────────────────────────
class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserListResponse(BaseModel):
    users: list[UserResponse]
    total: int


# Rebuild Token model to resolve forward ref
Token.model_rebuild()
