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

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str

class User(UserBase):
    id: str
    created_at: datetime
    is_active: bool = True
    is_verified: bool = False
    
    class Config:
        schema_extra = {
            "example": {
                "id": "5f8a3b2a3f2e1a1a1a1a1a1a",
                "email": "user@example.com",
                "username": "username",
                "created_at": "2020-10-17T00:00:00",
                "is_active": True,
                "is_verified": True
            }
        }
