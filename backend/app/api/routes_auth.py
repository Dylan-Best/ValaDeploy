from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.auth import UserRegisterSchema, UserResponseSchema
from app.services.auth_service import register_user


router = APIRouter()

@router.post("/register", response_model=UserResponseSchema)
def register(user:UserRegisterSchema, db : Session = Depends(get_db)):
    try:
        return register_user(user, db)

    except ValueError as e:
        raise HTTPException(
            status_code=409,
            detail=str(e)
        )