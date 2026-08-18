from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.auth import UserRegisterSchema, LoginSchema
from app.core.security import hash_password, verify_password


def register_user(user: UserRegisterSchema, db: Session) -> User:
    existing_user = (
        db.query(User) # table correspondant aux models users
        .filter(User.email == user.email)
        .first() # retourner le premier resultat 
    )
    
    if existing_user:
        raise ValueError("Email already registered")
    
    hashed_password = hash_password(user.password)
    
    new_user = User(
        full_name=user.full_name,
        email=user.email,
        password_hash=hashed_password,
    )
    
    try:
     db.add(new_user) # preparation pour insertion
     db.commit() #
     db.refresh(new_user) # charge les valeurs par defaut de postgres
    except Exception:
        db.rollback()
        raise # relance l'exception capture
    
    return new_user 

def login_user(user: LoginSchema, db: Session) -> User:

    existing_user = (
        db.query(User)
        .filter(User.email == user.email)
        .first()
    )

    if not existing_user:
        raise ValueError("Incorrect credentials")

    is_verify = verify_password(
        user.password,
        existing_user.password_hash
    )

    if not is_verify:
        raise ValueError("Incorrect credentials")

    if not existing_user.is_active:
        raise ValueError("Your account is inactive")

    return existing_user