from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.auth import UserRegisterSchema, UserResponseSchema, LoginSchema
from app.services.auth_service import register_user, login_user


router = APIRouter()

@router.post("/register", response_model=UserResponseSchema)
def register(user:UserRegisterSchema, db : Session = Depends(get_db)):
    try:
        return register_user(user, db)

    except ValueError as e:
        raise HTTPException(
            status_code=409, # conflict
            detail=str(e)
        )


@router.post("/login", response_model=UserResponseSchema)
def login(user:LoginSchema, db : Session = Depends(get_db)):
    try:
        return login_user(user, db)

    except ValueError as e:
        raise HTTPException(
            status_code=401, # unauthoried
            detail=str(e)
        )