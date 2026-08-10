from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# SQLite DB 파일은 backend 폴더 안에 app.db 로 생성됩니다.
SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"

# SQLite는 기본적으로 단일 스레드만 허용하므로 FastAPI(멀티 요청 처리)를 위해
# check_same_thread=False 옵션이 필요합니다.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """요청마다 DB 세션을 열고, 끝나면 자동으로 닫아주는 함수 (FastAPI Depends용)"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
