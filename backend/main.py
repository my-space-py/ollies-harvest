import json

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import and_, or_
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


# 주의: user_id를 별도 토큰 검증 없이 그대로 신뢰한다 (TODO.md 4.3 참고).
# 공모전 프로토타입 범위의 의도적인 단순화이며, 다른 사용자의 user_id를 알면
# 그 사람의 저장 데이터를 덮어쓸 수 있는 보안 위험이 있다는 점을 인지하고 있어야 한다.


@app.get("/save", response_model=schemas.SaveResponse)
def get_save(user_id: int, db: Session = Depends(get_db)):
    save = db.query(models.GameSave).filter(models.GameSave.user_id == user_id).first()
    if not save:
        raise HTTPException(status_code=404, detail="저장된 게임 데이터가 없습니다.")
    return schemas.SaveResponse(user_id=save.user_id, data=json.loads(save.data))


@app.put("/save", response_model=schemas.SaveResponse)
def put_save(payload: schemas.SaveRequest, db: Session = Depends(get_db)):
    save = db.query(models.GameSave).filter(models.GameSave.user_id == payload.user_id).first()
    data_json = json.dumps(payload.data)

    if save:
        save.data = data_json
    else:
        save = models.GameSave(user_id=payload.user_id, data=data_json)
        db.add(save)

    db.commit()
    db.refresh(save)
    return schemas.SaveResponse(user_id=save.user_id, data=json.loads(save.data))


@app.get("/leaderboard", response_model=schemas.LeaderboardResponse)
def get_leaderboard(limit: int = 20, db: Session = Depends(get_db)):
    rows = (
        db.query(models.GameSave, models.User)
        .join(models.User, models.GameSave.user_id == models.User.id)
        .all()
    )

    ranked = []
    for save, user in rows:
        try:
            data = json.loads(save.data)
        except (TypeError, ValueError):
            continue
        ranked.append({"nickname": user.nickname, "consumed": float(data.get("consumed") or 0)})

    ranked.sort(key=lambda entry: entry["consumed"], reverse=True)

    entries = [
        schemas.LeaderboardEntry(rank=index + 1, nickname=entry["nickname"], consumed=entry["consumed"])
        for index, entry in enumerate(ranked[:limit])
    ]
    return schemas.LeaderboardResponse(entries=entries)


@app.post("/friends/request")
def send_friend_request(payload: schemas.FriendRequestCreate, db: Session = Depends(get_db)):
    requester = db.query(models.User).filter(models.User.id == payload.requester_id).first()
    if not requester:
        raise HTTPException(status_code=404, detail="요청자 계정을 찾을 수 없습니다.")

    target = db.query(models.User).filter(models.User.username == payload.target_username).first()
    if not target:
        raise HTTPException(status_code=404, detail="해당 아이디의 사용자를 찾을 수 없습니다.")
    if target.id == requester.id:
        raise HTTPException(status_code=400, detail="자기 자신에게는 친구 요청을 보낼 수 없습니다.")

    existing = (
        db.query(models.Friendship)
        .filter(
            or_(
                and_(models.Friendship.requester_id == requester.id, models.Friendship.addressee_id == target.id),
                and_(models.Friendship.requester_id == target.id, models.Friendship.addressee_id == requester.id),
            )
        )
        .first()
    )
    if existing:
        detail = "이미 친구입니다." if existing.status == "accepted" else "이미 대기 중인 친구 요청이 있습니다."
        raise HTTPException(status_code=400, detail=detail)

    friendship = models.Friendship(requester_id=requester.id, addressee_id=target.id, status="pending")
    db.add(friendship)
    db.commit()
    return {"message": f"{target.nickname}님에게 친구 요청을 보냈습니다."}


@app.get("/friends/requests", response_model=schemas.FriendRequestListResponse)
def list_friend_requests(user_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(models.Friendship, models.User)
        .join(models.User, models.Friendship.requester_id == models.User.id)
        .filter(models.Friendship.addressee_id == user_id, models.Friendship.status == "pending")
        .all()
    )
    requests = [
        schemas.FriendRequestEntry(request_id=friendship.id, requester_id=user.id, requester_nickname=user.nickname)
        for friendship, user in rows
    ]
    return schemas.FriendRequestListResponse(requests=requests)


@app.post("/friends/accept")
def accept_friend_request(payload: schemas.FriendRequestAction, db: Session = Depends(get_db)):
    friendship = db.query(models.Friendship).filter(models.Friendship.id == payload.request_id).first()
    if not friendship or friendship.addressee_id != payload.user_id:
        raise HTTPException(status_code=404, detail="친구 요청을 찾을 수 없습니다.")

    friendship.status = "accepted"
    db.commit()
    return {"message": "친구 요청을 수락했습니다."}


@app.post("/friends/decline")
def decline_friend_request(payload: schemas.FriendRequestAction, db: Session = Depends(get_db)):
    friendship = db.query(models.Friendship).filter(models.Friendship.id == payload.request_id).first()
    if not friendship or friendship.addressee_id != payload.user_id:
        raise HTTPException(status_code=404, detail="친구 요청을 찾을 수 없습니다.")

    db.delete(friendship)
    db.commit()
    return {"message": "친구 요청을 거절했습니다."}


@app.get("/friends", response_model=schemas.FriendListResponse)
def list_friends(user_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(models.Friendship)
        .filter(
            models.Friendship.status == "accepted",
            or_(models.Friendship.requester_id == user_id, models.Friendship.addressee_id == user_id),
        )
        .all()
    )
    friend_ids = [row.addressee_id if row.requester_id == user_id else row.requester_id for row in rows]

    entries = []
    for friend_id in friend_ids:
        user = db.query(models.User).filter(models.User.id == friend_id).first()
        if not user:
            continue
        save = db.query(models.GameSave).filter(models.GameSave.user_id == friend_id).first()
        consumed = 0.0
        if save:
            try:
                consumed = float(json.loads(save.data).get("consumed") or 0)
            except (TypeError, ValueError):
                pass
        entries.append(schemas.FriendEntry(user_id=user.id, nickname=user.nickname, consumed=consumed))

    entries.sort(key=lambda entry: entry.consumed, reverse=True)
    return schemas.FriendListResponse(friends=entries)


