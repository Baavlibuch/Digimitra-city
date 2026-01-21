import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from shared.models import Base, Event
from tenacity import retry, stop_after_attempt, wait_fixed

@retry(stop=stop_after_attempt(10), wait=wait_fixed(5))
def get_db():
    db_url = os.environ.get("DATABASE_URL")
    engine = create_engine(db_url)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)()

@retry(stop=stop_after_attempt(10), wait=wait_fixed(5))
def create_tables():
    db_url = os.environ.get("DATABASE_URL")
    engine = create_engine(db_url)
    Base.metadata.create_all(bind=engine)

class Database:
    def __init__(self):
        self.SessionLocal = get_db()
        create_tables()

    def insert_event(self, event_data: dict):
        session = self.SessionLocal
        try:
            # Assuming event_data matches Event model fields.
            # We might need to map fields if they differ.
            # For now, simplistic mapping:
            event = Event(**event_data)
            session.add(event)
            session.commit()
        except Exception as e:
            session.rollback()
            print(f"Error inserting event: {e}")
        finally:
            session.close()
