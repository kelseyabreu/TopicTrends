import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import secrets
import string
from app.core.database import get_db
import logging

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT token settings
SECRET_KEY = os.environ.get("SECRET_KEY", "your-secret-key-here-for-development-only")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Token dependency
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

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
    logging.info(f"Looking up user by email: {email}")
    return await db.users.find_one({"email": email})

async def get_user_by_id(user_id: str):
    """Retrieve user by ID"""
    db = await get_db()
    return await db.users.find_one({"_id": user_id})

async def create_user(user_data):
    """Create a new user"""
    # Hash the password
    hashed_password = get_password_hash(user_data["password"])
    user_data["password"] = hashed_password
    
    # Generate verification code
    verification_code = generate_verification_code()
    
    # Add additional user fields
    user_data["created_at"] = datetime.utcnow()
    user_data["modified_at"] = user_data["created_at"]
    user_data["is_active"] = True
    user_data["is_verified"] = False
    user_data["verification_code"] = verification_code
    user_data["first_name"] = None
    user_data["last_name"] = None
    user_data["location"] = None
    user_data["timezone"] = "UTC"
    
    # Insert into database
    db = await get_db()
    result = await db.users.insert_one(user_data)
    
    # Return user data and verification code
    return {
        "user_id": str(result.inserted_id),
        "verification_code": verification_code
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

async def authenticate_user(email: str, password: str):
    """Authenticate user and return token"""
    user = await get_user_by_email(email)
    
    if not user:
        return False
    
    if not verify_password(password, user["password"]):
        return False
        
    return user

async def verify_user(email: str, code: str):
    """Verify user's email with verification code"""
    user = await get_user_by_email(email)
    
    if not user:
        return False
        
    if user["verification_code"] != code:
        return False
    
    db = await get_db()
    # Update user verification status
    await db.users.update_one(
        {"email": email},
        {"$set": {"is_verified": True}}
    )
    
    return True