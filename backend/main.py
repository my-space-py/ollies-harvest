from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from passlib.context import CryptContext

import models
import schemas
from database import engine, get_db

# 서버 시작 시 테이블이 없으면 자동 생성
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Auth API")

# 프론트엔드(정적 서버, 4174 포트)에서의 요청을 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4174",
        "http://127.0.0.1:4174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 비밀번호 해싱 설정 (평문 저장 방지)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@app.post("/signup", response_model=schemas.UserResponse)
def signup(payload: schemas.SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 사용 중인 아이디입니다.")

    hashed_pw = pwd_context.hash(payload.password)
    new_user = models.User(
        username=payload.username,
        nickname=payload.nickname,
        hashed_password=hashed_pw,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.post("/login", response_model=schemas.UserResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not pwd_context.verify(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")
    return user


@app.get("/")
def root():
    return {"message": "Auth API가 정상 동작 중입니다."}


