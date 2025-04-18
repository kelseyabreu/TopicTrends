from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
import uuid
import logging

from app.models.user_schemas import UserCreate, UserLogin, UserVerification, TokenResponse, User
from app.services.auth import (
    authenticate_user, create_user, verify_user, create_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES, verify_token
)
from app.services.email import send_verification_email

# Create router with tags for API docs
router = APIRouter(tags=["authentication"])

@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
async def register(user: UserCreate, background_tasks: BackgroundTasks):
    """Register a new user"""
    # Check if email already exists
    from app.services.auth import get_user_by_email
    existing_user = await get_user_by_email(user.email)
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Prepare user data
    user_data = {
        "_id": str(uuid.uuid4()),
        "email": user.email,
        "username": user.username,
        "password": user.password
    }
    
    # Create user
    result = await create_user(user_data)
    
    # Send verification email
    background_tasks.add_task(
        send_verification_email,
        user.email,
        user.username,
        result["verification_code"]
    )
    
    logging.info(f"User registered with email: {user.email}")
    return {"message": "User registered successfully. Please check your email to verify your account."}

@router.post("/auth/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login user and return access token"""
    user = await authenticate_user(form_data.username, form_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is verified
    if not user.get("is_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email first."
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["_id"]},
        expires_delta=access_token_expires
    )
    
    logging.info(f"User logged in: {user['email']}")
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user["_id"],
        "username": user["username"]
    }

@router.post("/auth/verify")
async def verify_email(verification: UserVerification, email: str):
    """Verify user email with verification code"""
    verified = await verify_user(email, verification.code)
    
    if not verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code"
        )
    
    logging.info(f"Email verified for: {email}")
    return {"message": "Email verified successfully"}

@router.post("/auth/resend-verification")
async def resend_verification(email: str, background_tasks: BackgroundTasks):
    """Resend verification email"""
    from app.services.auth import get_user_by_email, generate_verification_code
    
    user = await get_user_by_email(email)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    if user.get("is_verified", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already verified"
        )
    
    # Generate new verification code
    verification_code = generate_verification_code()
    
    # Update user's verification code
    from app.core.database import db
    await db.users.update_one(
        {"email": email},
        {"$set": {"verification_code": verification_code}}
    )
    
    # Send verification email
    background_tasks.add_task(
        send_verification_email,
        email,
        user["username"],
        verification_code
    )
    
    logging.info(f"Verification email resent to: {email}")
    return {"message": "Verification email sent"}

@router.get("/auth/me", response_model=User)
async def get_current_user(current_user = Depends(verify_token)):
    """Get current authenticated user"""
    return {
        "id": current_user["_id"],
        "email": current_user["email"],
        "username": current_user["username"],
        "created_at": current_user["created_at"],
        "is_active": current_user["is_active"],
        "is_verified": current_user["is_verified"]
    }