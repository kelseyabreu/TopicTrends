from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta, timezone, datetime
import uuid
import logging
from typing import Annotated

logger = logging.getLogger(__name__)
import secrets
import string

from app.models.user_schemas import (
    UserCreate, UserVerification, User, UserUpdateProfile,
    PasswordReset, TokenResponse # Using TokenResponse now
)
from app.services.auth import (
    authenticate_user, create_user, verify_user, create_access_token,
    verify_token_cookie, update_user_profile,
    get_user_by_email, get_user_by_id, create_password_reset_token,
    verify_password_reset_token, reset_user_password,
    generate_csrf_token, # Import CSRF generator
    CSRF_COOKIE_NAME,    # Import CSRF cookie name
    ACCESS_TOKEN_EXPIRE_MINUTES,
    verify_csrf_dependency # Import CSRF dependency
)
from app.services.email import send_verification_email, send_password_reset_email
from app.core.database import get_db
from app.core.config import settings

# --- Rate Limiting ---
from app.core.limiter import limiter

router = APIRouter(prefix="/auth", tags=["authentication"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.REGISTER_RATE_LIMIT)
async def register(
    request: Request, # Need request for limiter
    user: UserCreate,
    background_tasks: BackgroundTasks
    ):
    """Register a new user"""
    existing_user = await get_user_by_email(user.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    user_data = {
        "_id": str(uuid.uuid4()),
        "email": user.email,
        "username": user.username,
        "password": user.password
    }

    result = await create_user(user_data)

    background_tasks.add_task(
        send_verification_email,
        user.email,
        user.username,
        result["verification_code"]
    )

    logger.info(f"User registered: {user.email}")
    return {"message": "User registered successfully. Please check your email to verify your account."}

@router.post("/login", response_model=TokenResponse) # Use TokenResponse model
@limiter.limit(settings.LOGIN_RATE_LIMIT)
async def login(
    request: Request,
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
    ):
    """Login user, set HttpOnly access token cookie AND CSRF token cookie."""
    user = await authenticate_user(form_data.username, form_data.password) # Uses email as username field

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Form"}, 
        )

    # Check if user is verified
    if not user.get("is_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email first."
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive."
        )

    access_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user["_id"])},
        expires_delta=access_expires
    )

    # --- Set HttpOnly Access Token Cookie ---
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True, 
        samesite="lax", 
        max_age=int(access_expires.total_seconds()),
        path="/",
        domain=".amoneysolution.us"
    )

    # --- Generate and Set CSRF Token Cookie ---
    csrf_token = generate_csrf_token()
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False, 
        secure=True, 
        samesite="lax",
        max_age=int(access_expires.total_seconds()),
        path="/",
        domain=".amoneysolution.us"
    )

    logger.info(f"User logged in: {user['email']}")
    # Return info needed by frontend (token itself might not be needed if using /me)
    return TokenResponse(
        access_token=access_token,
        user_id=str(user["_id"]),
        username=user["username"]
    )

@router.post("/logout", dependencies=[Depends(verify_csrf_dependency)]) 
@limiter.limit("20/minute")
async def logout(
    request: Request, # Need request for limiter/CSRF
    response: Response):
    """Logout user by clearing access and CSRF cookies."""
    # CSRF check is handled by the dependency
    response.delete_cookie("access_token", path="/", secure=True, httponly=True, samesite="Lax",domain=".amoneysolution.us")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/", secure=True, httponly=False, samesite="Lax",domain=".amoneysolution.us")
    logger.info(f"User logout initiated by request.")
    return {"message": "Logout successful"}

@router.post("/verify")
@limiter.limit(settings.VERIFY_RATE_LIMIT)
async def verify_email(
    request: Request, # Need request for limiter
    verification: UserVerification,
    email: str # Receive email as query parameter or part of body? Let's assume body for now.
    # Consider making UserVerification include email: class UserVerification(BaseModel): email: EmailStr; code: str
    ):
    """Verify user email with verification code"""
    # Assuming email is part of UserVerification model or passed separately
    verified = await verify_user(email.lower(), verification.code)

    if not verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code, or email already verified."
        )

    logger.info(f"Email verified: {email}")
    return {"message": "Email verified successfully"}

@router.post("/resend-verification")
@limiter.limit("5/minute") # Stricter limit for resend
async def resend_verification(
    request: Request, # Need request for limiter
    email_body: dict, # Expect {"email": "user@example.com"}
    background_tasks: BackgroundTasks
    ):
    """Resend verification email"""
    email = email_body.get("email")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required.")

    user = await get_user_by_email(email)
    if not user:
        # Avoid confirming email existence
        logger.info(f"Verification resend requested for non-existent/unregistered email: {email}")
        return {"message": "If your email is registered and not verified, a new verification email will be sent."}

    if user.get("is_verified", False):
        logger.info(f"Verification resend requested for already verified email: {email}")
        # Avoid sending again if already verified
        return {"message": "Your email is already verified."}

    verification_code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    db = await get_db()
    update_result = await db.users.update_one(
        {"_id": user["_id"]}, # Use ID for certainty
        {"$set": {"verification_code": verification_code, "modified_at": datetime.now(timezone.utc)}}
    )

    if update_result.modified_count == 0:
         logger.error(f"Failed to update verification code for user {email}")
         # Still return generic message, maybe log error
         return {"message": "If your email is registered and not verified, a new verification email will be sent."}


    background_tasks.add_task(
        send_verification_email,
        email,
        user["username"],
        verification_code
    )

    logger.info(f"Verification email resent to: {email}")
    return {"message": "If your email is registered and not verified, a new verification email will be sent."}


@router.get("/me", response_model=User)
@limiter.limit("100/minute")
async def get_current_user(
    request: Request, # Need request for limiter
    # Dependency verifies cookie and returns user dict
    current_user: Annotated[dict, Depends(verify_token_cookie)]
    ):
    """Get current authenticated user details from cookie."""
    # verify_token_cookie handles 401 if no/invalid cookie
    # Map DB user dict to Pydantic User model
    user_data = {
        "id": str(current_user["_id"]),
        "email": current_user["email"],
        "username": current_user["username"],
        "first_name": current_user.get("first_name"),
        "last_name": current_user.get("last_name"),
        "location": current_user.get("location"),
        "timezone": current_user.get("timezone", "UTC"),
        "created_at": current_user.get("created_at", datetime.now(timezone.utc)), # Provide default if missing
        "modified_at": current_user.get("modified_at"),
        "is_active": current_user.get("is_active", True),
        "is_verified": current_user.get("is_verified", False)
    }
    return User(**user_data)

@router.put("/profile", response_model=User, dependencies=[Depends(verify_csrf_dependency)]) # Apply CSRF check
@limiter.limit(settings.PROFILE_UPDATE_RATE_LIMIT)
async def update_profile(
    request: Request, # Need request for limiter/CSRF
    profile_data: UserUpdateProfile,
    current_user: Annotated[dict, Depends(verify_token_cookie)]
    ):
    """Update user profile information (Requires auth cookie + CSRF token)."""
    # verify_token_cookie handles auth, verify_csrf_dependency handles CSRF
    user_id = str(current_user["_id"])

    update_data = profile_data.model_dump(exclude_unset=True) # Use model_dump with exclude_unset
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No profile data provided for update."
        )

    success = await update_user_profile(user_id, update_data)
    if not success:
        # Check if user exists, maybe profile wasn't actually changed?
        updated_user_check = await get_user_by_id(user_id)
        if updated_user_check:
             logger.info(f"Profile update for user {user_id} resulted in no changes.")
             # Return current data if no change
        else:
             logger.error(f"Failed to update profile for user {user_id}, user may not exist.")
             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")


    updated_user = await get_user_by_id(user_id)
    if not updated_user:
         # Should not happen if update seemed successful
         logger.error(f"Could not retrieve updated profile for user {user_id} after update.")
         raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve updated profile.")

    logger.info(f"Profile updated for user: {updated_user['email']}")
    user_response_data = {
        "id": str(updated_user["_id"]),
        **updated_user
    }
    return User(**user_response_data)

@router.post("/forgot-password")
@limiter.limit(settings.PASSWORD_RESET_REQ_RATE_LIMIT)
async def forgot_password(
    request: Request, # Need request for limiter
    email_body: dict, # Expect {"email": "user@example.com"}
    background_tasks: BackgroundTasks
    ):
    """Request password reset"""
    email = email_body.get("email")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required.")

    user = await get_user_by_email(email)
    generic_message = {"message": "If your email is registered and verified, you will receive a password reset link."}

    if not user:
        logger.info(f"Password reset requested for non-existent email: {email}")
        return generic_message

    # Only allow password reset for verified users
    if not user.get("is_verified", False):
        logger.info(f"Password reset requested for unverified email: {email}")
        return generic_message 

    # Generate a password reset token
    reset_token = await create_password_reset_token(str(user["_id"]))

    # Send password reset email
    background_tasks.add_task(
        send_password_reset_email,
        email,
        user["username"],
        reset_token
    )

    logger.info(f"Password reset requested for: {email}")
    return generic_message

@router.post("/reset-password")
@limiter.limit(settings.PASSWORD_RESET_RATE_LIMIT)
async def reset_password(
    request: Request, # Need request for limiter
    reset_data: PasswordReset
    ):
    """Reset password using token"""
    # Verify token
    user_id = await verify_password_reset_token(reset_data.email, reset_data.token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token."
        )

    # Reset password
    success = await reset_user_password(user_id, reset_data.password)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset password. Please try again."
        )

    logger.info(f"Password reset successful for user ID: {user_id}")
    return {"message": "Password reset successful. You can now login with your new password."}