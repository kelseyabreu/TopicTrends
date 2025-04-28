from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Response, Cookie
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
import uuid
import logging
import secrets
import string

from app.models.user_schemas import UserCreate, UserVerification, User, UserUpdateProfile
from app.services.auth import (
    authenticate_user, create_user, verify_user, create_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES, verify_token_cookie, update_user_profile,
    get_user_by_email, get_user_by_id
)
from app.services.email import send_verification_email
from app.core.database import get_db

# Create router with tags for API docs
router = APIRouter(prefix="/auth", tags=["authentication"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(user: UserCreate, background_tasks: BackgroundTasks):
    """Register a new user"""
    # Check if email already exists
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

@router.post("/login")
async def login(response: Response, form_data: OAuth2PasswordRequestForm = Depends()):
    """Login user and return access token"""
    user = await authenticate_user(form_data.username, form_data.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # Check if user is verified
    if not user.get("is_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Email not verified. Please verify your email first."
        )
    access_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(data={"sub": user["_id"]}, expires_delta=access_expires)
   
    # Set HTTP-only cookie
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/"
    )

    logging.info(f"User logged in: {user['email']}")
    return {
        "user_id": user["_id"],
        "username": user["username"]
    }

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"message": "Logout successful"}

@router.post("/verify")
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

@router.post("/resend-verification")
async def resend_verification(email: str, background_tasks: BackgroundTasks):
    """Resend verification email"""
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
    verification_code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    
    # Update user's verification code
    db = await get_db()
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

@router.get("/me", response_model=User)
async def get_current_user(current_user=Depends(verify_token_cookie)):
    """Get current authenticated user"""
    return {
        "id": current_user["_id"],
        "email": current_user["email"],
        "username": current_user["username"],
        "first_name": current_user.get("first_name"),
        "last_name": current_user.get("last_name"),
        "location": current_user.get("location"),
        "timezone": current_user.get("timezone", "UTC"),
        "created_at": current_user["created_at"],
        "modified_at": current_user.get("modified_at", current_user["created_at"]),
        "is_active": current_user["is_active"],
        "is_verified": current_user["is_verified"]
    }

@router.put("/profile", response_model=User)
async def update_profile(profile_data: UserUpdateProfile, current_user=Depends(verify_token_cookie)):
    """Update user profile information"""
    # Create update data dictionary with only provided fields
    update_data = {k: v for k, v in profile_data.dict().items() if v is not None}

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="No profile data provided for update"
        )
    
    # Update the user profile
    success = await update_user_profile(current_user["_id"], update_data)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile"
        )

    # Get updated user data
    updated_user = await get_user_by_id(current_user["_id"])

    logging.info(f"Profile updated for user: {updated_user['email']}")
    
    # Return updated user information
    return {
        "id": updated_user["_id"],
        "email": updated_user["email"],
        "username": updated_user["username"],
        "first_name": updated_user.get("first_name"),
        "last_name": updated_user.get("last_name"),
        "location": updated_user.get("location"),
        "timezone": updated_user.get("timezone", "UTC"),
        "created_at": updated_user["created_at"],
        "modified_at": updated_user.get("modified_at"),
        "is_active": updated_user["is_active"],
        "is_verified": updated_user["is_verified"]
    }