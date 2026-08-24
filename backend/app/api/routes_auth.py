from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.auth import UserRegisterSchema, UserResponseSchema, LoginSchema, TokenSchema
from app.services.auth_service import register_user, login_user, logout_user, refresh_access_token
from app.core.security import get_current_user, require_admin
from app.models.user import User
from app.core.config import settings


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



#@router.post("/login", response_model=UserResponseSchema) # avant
@router.post("/login", response_model=TokenSchema)
def login(user: LoginSchema, response: Response, db: Session = Depends(get_db)):
    try:
        # toute la logique métier est dans le service, la route ne fait qu'appeler
        access_token, refresh_token = login_user(user, db)

        # on pose le refresh_token dans un cookie httpOnly (invisible en JS)
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,       # inaccessible via document.cookie -> protège du XSS
            #secure=True,         # envoyé seulement en HTTPS
            secure=False,
            samesite="strict",   # protège du CSRF basique
            max_age=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
            path="/api/auth",        # le cookie ne part que vers /api/auth/* (pas /projects, /me...)
        )

        return {"access_token": access_token, "token_type": "bearer"}

    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/refresh", response_model=TokenSchema)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):

    # on récupère le refresh_token depuis le cookie (pas depuis le body/header)
    raw_token = request.cookies.get("refresh_token")

    try:
        # toute la logique (vérif, rotation, génération) est dans le service
        new_access_token, new_refresh_token = refresh_access_token(raw_token, db)

    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    # on remplace le cookie par le NOUVEAU refresh_token (rotation côté client aussi)
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=False, # en dev , remettre en https plus tard
        samesite="strict",
        max_age=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        path="/api/auth",
    )

    return {"access_token": new_access_token, "token_type": "bearer"} 

@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):

    raw_token = request.cookies.get("refresh_token")

    # révoque le refresh_token en DB (côté service)
    logout_user(raw_token, db)

    # supprime le cookie côté navigateur
    response.delete_cookie("refresh_token", path="/api/auth")

    return {"message": "Logged out"}

@router.get("/me", response_model=UserResponseSchema)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# ========= TEST =================
@router.get("/admin-test")
def admin_test(
    current_user: User = Depends(require_admin),
):
    return {
        "message": "Welcome admin",
        "user": current_user.email,
    }