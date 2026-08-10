from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)  # 아이디 (로그인용, 중복 불가)
    nickname = Column(String, nullable=False)  # 닉네임 (화면 표시용)
    hashed_password = Column(String, nullable=False)  # 비밀번호는 절대 평문 저장 안 함
    created_at = Column(DateTime(timezone=True), server_default=func.now())
