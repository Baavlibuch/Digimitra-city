import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

# Monkeypatch passlib to support bcrypt >= 4.1.0 and 5.0.0+
try:
    import bcrypt
    if not hasattr(bcrypt, "__about__"):
        class About:
            __version__ = getattr(bcrypt, "__version__", "4.0.0")
        bcrypt.__about__ = About()
except ImportError:
    pass

try:
    import passlib.handlers.bcrypt as _pl_bcrypt
    _pl_original_detect_wrap_bug = _pl_bcrypt.detect_wrap_bug
    def _patched_detect_wrap_bug(ident):
        try:
            return _pl_original_detect_wrap_bug(ident)
        except ValueError:
            return False
    _pl_bcrypt.detect_wrap_bug = _patched_detect_wrap_bug
except Exception:
    pass

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from . import database
from shared.models import User

# --- Configuration ---
SECRET_KEY = os.environ.get("JWT_SECRET", "devsecret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


def allow_any_login() -> bool:
    """When True, /api/v1/token accepts any credentials and JWTs work without a DB user row."""
    return os.getenv("ALLOW_ANY_LOGIN", "true").lower() in ("1", "true", "yes")


# --- Password Hashing ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- OAuth2 Scheme ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/token")

# --- Functions ---

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        if allow_any_login():
            return User(
                id=str(uuid.uuid4()),
                username=username,
                password="",
                role=payload.get("role") or "admin",
            )
        raise credentials_exception
    return user

def get_current_active_user(current_user: User = Depends(get_current_user)):
    # In the future, we could add a `disabled` field to the User model
    return current_user

def role_checker(required_roles: list):
    def check_roles(current_user: User = Depends(get_current_active_user)):
        if current_user.role not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The user does not have enough privileges"
            )
        return current_user
    return check_roles
