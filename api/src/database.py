import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from shared.models import Base

db_url = os.environ.get("DATABASE_URL")
engine = create_engine(db_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_tables():
    Base.metadata.create_all(bind=engine)
