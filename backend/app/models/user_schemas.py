from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)

class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserVerification(BaseModel):
    code: str

class PasswordReset(BaseModel):
    email: EmailStr
    token: str
    password: str = Field(..., min_length=8)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str

class UserUpdateProfile(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    location: Optional[str] = None
    timezone: Optional[str] = None

class User(UserBase):
    id: str
    created_at: datetime
    modified_at: Optional[datetime] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    location: Optional[str] = None
    timezone: Optional[str] = "UTC"
    is_active: bool = True
    is_verified: bool = False
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "5f8a3b2a3f2e1a1a1a1a1a1a",
                "email": "user@example.com",
                "username": "username",
                "first_name": "John",
                "last_name": "Doe",
                "location": "New York, USA",
                "timezone": "America/New_York",
                "created_at": "2020-10-17T00:00:00",
                "modified_at": "2020-11-20T00:00:00",
                "is_active": True,
                "is_verified": True
            }
        }