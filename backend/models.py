from sqlalchemy import Column, ForeignKey, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)  # 아이디 (로그인용, 중복 불가)
    nickname = Column(String, nullable=False)  # 닉네임 (화면 표시용)
    hashed_password = Column(String, nullable=False)  # 비밀번호는 절대 평문 저장 안 함
    friend_code = Column(String, unique=True, index=True, nullable=True)  # 친구 검색용 코드, 가입 시 자동 발급
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GameSave(Base):
    """유저 1명당 게임 진행 데이터 1건. 프론트의 localStorage 저장 객체를
    그대로 JSON 문자열로 저장한다 (필드별 컬럼화 대신 통짜 blob 저장)."""

    __tablename__ = "game_saves"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    data = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Friendship(Base):
    """친구 요청 1건. status가 'accepted'가 되면 requester/addressee 둘 다 서로의 친구로 취급한다.
    (양방향 관계를 한 행으로 표현하므로 목록 조회 시 방향에 상관없이 조회한다.)"""

    __tablename__ = "friendships"

    id = Column(Integer, primary_key=True, index=True)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    addressee_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="pending")  # pending | accepted
    created_at = Column(DateTime(timezone=True), server_default=func.now())
