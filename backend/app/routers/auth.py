"""
MedicX — Authentication Router
Handles user registration, login, and token management.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserRegister, UserLogin, Token, UserResponse
from app.middleware.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, log_action,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=Token, status_code=201)
def register(data: UserRegister, request: Request, db: Session = Depends(get_db)):
    """Register a new user account."""
    # Check if email already exists
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Log action
    log_action(db, user.id, "register", "user", user.id,
               ip_address=request.client.host if request.client else None)

    # Generate token
    token = create_access_token({"sub": user.id, "role": user.role.value})
    return Token(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=Token)
def login(data: UserLogin, request: Request, db: Session = Depends(get_db)):
    """Authenticate and get access token."""
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account has been deactivated")

    # Log action
    log_action(db, user.id, "login", "user", user.id,
               ip_address=request.client.host if request.client else None)

    token = create_access_token({"sub": user.id, "role": user.role.value})
    return Token(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user profile."""
    return UserResponse.model_validate(current_user)
