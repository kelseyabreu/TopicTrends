"""
Authentication and authorization service for TopicTrends.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Annotated
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Cookie, Request, Response, Header
from fastapi.security import OAuth2PasswordBearer
import secrets
import string
import logging
from app.core.config import settings
from app.core.database import get_db

# Setup logging
logger = logging.getLogger(__name__)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT token settings
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.JWT_ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
RESET_TOKEN_EXPIRE_MINUTES = settings.RESET_TOKEN_EXPIRE_MINUTES

# Participation Token settings
PT_SECRET_KEY = settings.PARTICIPATION_TOKEN_SECRET_KEY
PT_ALGORITHM = settings.PARTICIPATION_TOKEN_ALGORITHM
PT_EXPIRE_MINUTES = settings.PARTICIPATION_TOKEN_EXPIRE_MINUTES

# CSRF settings
CSRF_SECRET_KEY = settings.CSRF_SECRET_KEY 
CSRF_COOKIE_NAME = "csrftoken"
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_TOKEN_BYTES = 32 

# API Key settings
ALLOWED_API_KEYS = settings.ALLOWED_API_KEYS 

# --- Exceptions ---
credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
)
csrf_exception = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="CSRF token mismatch or missing",
)
api_key_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid or missing API Key",
    headers={"WWW-Authenticate": "API-Key"},
)

# Token dependency
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login") 

def verify_password(plain_password, hashed_password):
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    """Generate password hash"""
    return pwd_context.hash(password)

async def get_user_by_email(email: str):
    """Retrieve user by email"""
    db = await get_db()
    logger.info(f"Looking up user by email: {email}") 
    return await db.users.find_one({"email": email.lower()})

async def get_user_by_id(user_id: str):
    """Retrieve user by ID"""
    db = await get_db()
    return await db.users.find_one({"_id": user_id})

async def create_user(user_data: dict):
    """Create a new user"""
    db = await get_db()

    verification_code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    hashed_password = get_password_hash(user_data["password"])
    now = datetime.now(timezone.utc)

    user_doc = {
        "_id": user_data["_id"],
        "email": user_data["email"].lower(),
        "username": user_data["username"],
        "password": hashed_password,
        "created_at": now,
        "modified_at": now,
        "is_active": True,
        "is_verified": False,
        "verification_code": verification_code,
        "first_name": None,
        "last_name": None,
        "location": None,
        "timezone": "UTC"
    }
    await db.users.insert_one(user_doc)
    logger.info(f"User created: {user_doc['email']}")
    # Return the user data including the code for sending email
    return {
        "verification_code": verification_code,
        **user_doc
    }

async def update_user_profile(user_id: str, update_data: Dict[str, Any]):
    """Update user profile information"""
    update_data["modified_at"] = datetime.now(timezone.utc)
    db = await get_db()
    result = await db.users.update_one(
        {"_id": user_id},
        {"$set": update_data}
    )
    logger.info(f"Profile update attempted for user {user_id}. Modified count: {result.modified_count}")
    return result.modified_count > 0

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt

async def _decode_jwt(token: str, secret: str, algorithms: list[str]):
    """Internal helper to decode JWT"""
    try:
        payload = jwt.decode(token, secret, algorithms=algorithms)
        return payload
    except jwt.ExpiredSignatureError:
        logger.info("Token expired.")
        raise credentials_exception # Re-use 401 for expired tokens
    except jwt.JWTError as e:
        logger.warning(f"Token validation failed: {e}")
        raise credentials_exception

# Cookie-based token verification
async def verify_token_cookie(access_token: Annotated[str | None, Cookie()] = None) -> dict:
    """Verify JWT token from cookie and return user dict from DB."""
    if not access_token:
        # logger.debug("Verify token cookie: No access_token cookie found.")
        raise credentials_exception

    payload = await _decode_jwt(access_token, SECRET_KEY, [ALGORITHM])
    user_id: str = payload.get("sub")
    if user_id is None:
        logger.warning("Token payload missing 'sub' (user_id).")
        raise credentials_exception

    user = await get_user_by_id(user_id)
    if user is None:
        logger.warning(f"User not found for token sub: {user_id}")
        raise credentials_exception

    return user 

async def authenticate_user(email: str, password: str):
    """Authenticate user with email and password"""
    # Convert email to lowercase before lookup
    user = await get_user_by_email(email.lower())
    if not user:
        return None
    if not verify_password(password, user["password"]):
        return None
    return user

async def verify_user(email: str, code: str):
    """Verify user's email with verification code"""
    db = await get_db()
    # Convert email to lowercase for the query
    user = await db.users.find_one({
        "email": email.lower(),
        "verification_code": code,
        "is_verified": False 
    })

    if user:
        # User found and code matches, update verification status
        result = await db.users.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "is_verified": True,
                    "modified_at": datetime.now(timezone.utc)
                },
                "$unset": {"verification_code": ""}
            }
        )
        logger.info(f"User email verified: {email}")
        return result.modified_count > 0
    logger.warning(f"Verification failed for email {email} with code {code}")
    return False

async def create_password_reset_token(user_id: str) -> str:
    """Create a password reset token"""
    expire = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": user_id,
        "type": "password_reset",
        "exp": expire
    }
    encoded_token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    # Store token hash in database for verification
    db = await get_db()
    token_data = {
        "user_id": user_id,
        "token": encoded_token, 
        "created_at": datetime.now(timezone.utc),
        "expires_at": expire,
        "used": False
    }
    # Remove old, unused tokens for the same user before inserting new one
    await db.password_reset_tokens.delete_many({"user_id": user_id, "used": False})
    await db.password_reset_tokens.insert_one(token_data)
    logger.info(f"Password reset token created for user {user_id}")
    return encoded_token

async def verify_password_reset_token(email: str, token: str) -> Optional[str]:
    """Verify a password reset token and return the user ID if valid"""
    db = await get_db()

    try:
        # First verify the token structure
        payload = await _decode_jwt(token, SECRET_KEY, [ALGORITHM])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")

        if user_id is None or token_type != "password_reset":
            logger.warning(f"Invalid token format for password reset: {payload}")
            return None

        # Check token in database
        token_record = await db.password_reset_tokens.find_one({
            "token": token, 
            "user_id": user_id,
            "used": False,
            "expires_at": {"$gt": datetime.now(timezone.utc)} 
        })

        if not token_record:
            logger.warning(f"Password reset token not found, expired, or used: {token[:10]}...")
            return None

         # Verify the email matches the user
        user = await get_user_by_id(user_id)
        if not user or user["email"].lower() != email.lower():
            logger.warning(f"Token user ID {user_id} email does not match provided email {email}")
            return None

        logger.info(f"Password reset token verified for user {user_id}")
        return user_id

    except HTTPException as e:
        if e.status_code == status.HTTP_401_UNAUTHORIZED:
             logger.warning(f"Password reset token verification failed (expired or invalid JWT): {token[:10]}...")
             return None
        raise e
    except Exception as e:
        logger.error(f"Unexpected error verifying password reset token: {e}", exc_info=True)
        return None

async def reset_user_password(user_id: str, new_password: str) -> bool:
    """Reset user password"""
    db = await get_db()
    
    try:
        # Hash the new password
        hashed_password = get_password_hash(new_password)
        
        # Update user password
        result = await db.users.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "password": hashed_password,
                    "modified_at": datetime.now(timezone.utc)
                }
            }
        )

        if result.modified_count == 0:
            logger.warning(f"Failed to update password for user {user_id}")
            return False

        # Mark the specific token used as 'used'
        # Finding the token again might be needed if not passed directly
        # For now, assume the verification step happened just before this.
        # It's safer to mark *all* valid tokens for the user as used upon successful reset.
        update_tokens_result = await db.password_reset_tokens.update_many(
            {"user_id": user_id, "used": False, "expires_at": {"$gt": datetime.now(timezone.utc)}},
            {"$set": {"used": True}}
        )
        logger.info(f"Marked {update_tokens_result.modified_count} password reset tokens as used for user {user_id}")
        logger.info(f"Password reset successful for user {user_id}")
        return True

    except Exception as e:
        logger.error(f"Error resetting password for user {user_id}: {e}", exc_info=True)
        return False

# --- NEW CSRF Functions ---
def generate_csrf_token() -> str:
    """Generates a secure random CSRF token."""
    return secrets.token_hex(CSRF_TOKEN_BYTES)

async def verify_csrf_dependency(
    request: Request,
    csrf_token_cookie: Annotated[str | None, Cookie(alias=CSRF_COOKIE_NAME)] = None,
    csrf_token_header: Annotated[str | None, Header(alias=CSRF_HEADER_NAME)] = None,
):
    """
    FastAPI Dependency to verify CSRF token for state-changing methods.
    Reads token from cookie and header, raises 403 if mismatch/missing.
    Skips check for safe methods (GET, HEAD, OPTIONS).
    """
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return

    if not csrf_token_cookie or not csrf_token_header:
        logger.warning(f"CSRF check failed: Missing cookie ({bool(csrf_token_cookie)}) or header ({bool(csrf_token_header)}) for {request.method} {request.url.path}")
        raise csrf_exception

    if not secrets.compare_digest(csrf_token_cookie, csrf_token_header):
        logger.warning(f"CSRF check failed: Token mismatch for {request.method} {request.url.path}")
        raise csrf_exception
    # logger.debug(f"CSRF check passed for {request.method} {request.url.path}") # Reduce noise

# --- NEW API Key Dependency ---
async def verify_api_key(
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None
):
    """Dependency to verify the API key provided in the X-API-Key header."""
    if not x_api_key:
        logger.warning("API Key check failed: Missing X-API-Key header.")
        raise api_key_exception

    # Use compare_digest for potentially sensitive keys, though timing attacks less likely here
    valid_key = False
    for key in ALLOWED_API_KEYS:
        if secrets.compare_digest(x_api_key, key):
            valid_key = True
            break

    if not valid_key:
        logger.warning(f"API Key check failed: Invalid key provided: {x_api_key[:5]}...") # Log prefix only
        raise api_key_exception

    logger.info("API Key verified successfully.")

# --- NEW Participation Token Functions ---
def create_participation_token(discussion_id: str, anonymous_user_id: str) -> str:
    """Creates a short-lived JWT for anonymous discussion participation."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=PT_EXPIRE_MINUTES)
    to_encode = {
        "discussion_id": discussion_id,
        "anon_user_id": anonymous_user_id,
        "exp": expire,
        "sub": anonymous_user_id,  # Subject can be the anonymous ID
        "type": "participation"  # Distinguish from auth tokens
    }
    encoded_jwt = jwt.encode(to_encode, PT_SECRET_KEY, algorithm=PT_ALGORITHM)
    return encoded_jwt

def verify_participation_token(token: str) -> dict | None:
    """Verifies the participation token. Returns payload dict or None."""
    try:
        # Use options={"require": ["exp", "sub", "type", "discussion_id", "anon_user_id"]} ?
        # decode already checks expiry if present. require_exp ensures it IS present.
        payload = jwt.decode(
            token,
            PT_SECRET_KEY,
            algorithms=[PT_ALGORITHM],
            options={"require_exp": True}
        )
        if payload.get("type") != "participation" or \
           not payload.get("discussion_id") or \
           not payload.get("anon_user_id"):
            logger.warning("Participation token invalid type or missing required fields.")
            return None
        # logger.debug("Participation token verified successfully.") # Reduce noise
        return payload
    except jwt.ExpiredSignatureError:
        logger.info("Participation token expired.")
        return None
    except jwt.JWTError as e:
        logger.warning(f"Participation token validation failed: {e}")
        return None

# --- Manual CSRF Check Helper ---
async def check_csrf_manual(request: Request):
    """Manually checks CSRF header against cookie for specific routes."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return # No check needed for safe methods

    csrf_token_cookie = request.cookies.get(CSRF_COOKIE_NAME)
    csrf_token_header = request.headers.get(CSRF_HEADER_NAME)

    if not csrf_token_cookie or not csrf_token_header:
        logger.warning(f"Manual CSRF check failed: Missing cookie or header for {request.method} {request.url.path}")
        raise csrf_exception

    if not secrets.compare_digest(csrf_token_cookie, csrf_token_header):
        logger.warning(f"Manual CSRF check failed: Token mismatch for {request.method} {request.url.path}")
        raise csrf_exception
    # logger.debug(f"Manual CSRF check passed for {request.method} {request.url.path}") # Reduce noise

async def get_optional_current_user(
    access_token: Annotated[str | None, Cookie()] = None
) -> Optional[dict]:
    """
    Similar to verify_token_cookie but doesn't raise an exception if no token is provided.
    
    Args:
        access_token: The access token cookie (optional)
        
    Returns:
        User data dict if authenticated, None otherwise
    """
    if not access_token:
        return None
        
    try:
        payload = await _decode_jwt(access_token, SECRET_KEY, [ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            logger.warning("Token payload missing 'sub' (user_id).")
            return None
            
        user = await get_user_by_id(user_id)
        if user is None:
            logger.warning(f"User not found for token sub: {user_id}")
            return None
            
        return user
        
    except HTTPException:
        return None
    except Exception as e:
        logger.error(f"Error in get_optional_current_user: {e}", exc_info=True)
        return None