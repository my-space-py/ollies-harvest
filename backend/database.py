from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# SQLite DB 파일은 backend 폴더 안에 app.db 로 생성됩니다.
# 서버를 어느 폴더에서 실행하든 같은 파일을 쓰도록 이 파일 기준 절대 경로를 사용합니다.
# (상대 경로 "./app.db"는 실행 위치마다 다른 빈 DB가 새로 생겨 저장이 사라진 것처럼 보였음)
DB_PATH = Path(__file__).resolve().parent / "app.db"
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

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
