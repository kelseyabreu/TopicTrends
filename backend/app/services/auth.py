"""
Authentication and authorization service for TopicTrends.
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Cookie
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
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Token dependency
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def verify_password(plain_password, hashed_password):
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    """Generate password hash"""
    return pwd_context.hash(password)

def generate_verification_code(length=6):
    """Generate a random verification code"""
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

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
    
    # Generate verification code
    verification_code = secrets.SystemRandom().choices(
        string.ascii_uppercase + string.digits, k=6
    )
    verification_code = ''.join(verification_code)

    hashed_password = get_password_hash(user_data["password"])

    user_doc = {
        "_id": user_data["_id"],
        "email": user_data["email"].lower(),
        "username": user_data["username"],
        "password": hashed_password,
        "created_at": datetime.utcnow(),
        "modified_at": datetime.utcnow(),
        "is_active": True,
        "is_verified": False,
        "verification_code": verification_code,
        "first_name": None,
        "last_name": None,
        "location": None,
        "timezone": "UTC"
    }
    await db.users.insert_one(user_doc)
    
    # Return the user data including the code for sending email
    return {
        "verification_code": verification_code, 
        **user_doc
    }

async def update_user_profile(user_id: str, update_data: Dict[str, Any]):
    """Update user profile information"""
    # Add modification timestamp
    update_data["modified_at"] = datetime.utcnow()
    
    # Update the user in the database
    db = await get_db()
    result = await db.users.update_one(
        {"_id": user_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        return False
    
    return True

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    return encoded_jwt

async def verify_token(token: str = Depends(oauth2_scheme)):
    """Verify JWT token and return user"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        
        if user_id is None:
            raise credentials_exception
        
    except JWTError:
        raise credentials_exception
    
    db = await get_db()
    user = await db.users.find_one({"_id": user_id})
    
    if user is None:
        raise credentials_exception
        
    return user

# Alternative cookie-based token verification
async def verify_token_cookie(access_token: Optional[str] = Cookie(None)):
    """Verify JWT token from cookie and return user"""
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    return await verify_token(access_token)

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
                    "modified_at": datetime.utcnow()
                },
                "$unset": {"verification_code": ""}
            }
        )
        return result.modified_count > 0
    return False