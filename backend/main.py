import hashlib
import json
import os
import random
import secrets
import string
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import and_, func, or_, text, update
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session
from passlib.context import CryptContext

import models
import schemas
from database import engine, get_db
from game_levels import get_level_by_consumed, get_current_week_key

# 서버 시작 시 테이블이 없으면 자동 생성
models.Base.metadata.create_all(bind=engine)


def _ensure_friend_code_column():
    """기존 SQLite DB(users 테이블)에 friend_code 컬럼이 없으면 추가하고,
    이미 있는 계정에는 코드를 새로 발급한다. (create_all은 새 컬럼을 추가해주지 않음)"""
    with engine.connect() as conn:
        try:
            conn.execute(text("SELECT friend_code FROM users LIMIT 1"))
        except OperationalError:
            conn.execute(text("ALTER TABLE users ADD COLUMN friend_code VARCHAR"))
            conn.commit()

    with Session(engine) as db:
        users_without_code = db.query(models.User).filter(
            or_(models.User.friend_code.is_(None), models.User.friend_code == "")
        ).all()
        for user in users_without_code:
            user.friend_code = _generate_friend_code(db)
        if users_without_code:
            db.commit()


def _generate_friend_code(db: Session) -> str:
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "".join(random.choices(alphabet, k=8))
        exists = db.query(models.User).filter(models.User.friend_code == code).first()
        if not exists:
            return code


_ensure_friend_code_column()

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
    # bcrypt는 느리므로(수백 ms) DB 연결을 잡기 전에 계산한다. 연결을 쥔 채 해시하면 가입이 몰릴 때
    # 연결 풀(최대 15개)이 바닥나 30초 대기 후 500 오류가 났다 (동시 가입 150건 중 105건 실패를 재현).
    hashed_pw = pwd_context.hash(payload.password)

    existing = db.query(models.User).filter(models.User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 사용 중인 아이디입니다.")

    for _ in range(3):
        new_user = models.User(
            username=payload.username,
            nickname=payload.nickname,
            hashed_password=hashed_pw,
            friend_code=_generate_friend_code(db),
        )
        db.add(new_user)
        try:
            db.commit()
        except IntegrityError:
            # 같은 아이디가 동시에 가입했거나, 드물게 친구 코드가 동시에 겹친 경우
            db.rollback()
            if db.query(models.User.id).filter(models.User.username == payload.username).first():
                raise HTTPException(status_code=400, detail="이미 사용 중인 아이디입니다.")
            continue
        db.refresh(new_user)
        return new_user
    raise HTTPException(status_code=500, detail="잠시 후 다시 시도해주세요.")


@app.post("/login", response_model=schemas.UserResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    # 느린 bcrypt 확인 전에 DB 연결을 풀에 돌려준다 (불러온 값은 그대로 남아 응답에 사용 가능)
    db.close()
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


def _update_if_not_older(db: Session, user_id: int, data_json: str, saved_at) -> int:
    """저장된 lastSavedAt보다 오래되지 않은 경우에만 덮어쓴다 (조건 확인과 갱신을 한 문장으로 처리해
    동시에 들어온 요청 사이에서도 안전). 반환값: 갱신된 행 수."""
    query = update(models.GameSave).where(models.GameSave.user_id == user_id)
    if saved_at is not None:
        stored_at = func.coalesce(func.json_extract(models.GameSave.data, "$.lastSavedAt"), 0)
        query = query.where(stored_at <= saved_at)
    return db.execute(query.values(data=data_json)).rowcount


@app.put("/save", response_model=schemas.SaveResponse)
def put_save(payload: schemas.SaveRequest, db: Session = Depends(get_db)):
    # 프론트는 저장 요청을 응답을 기다리지 않고 연달아 보내므로 도착 순서가 뒤바뀔 수 있다.
    # 늦게 도착한 오래된 저장(lastSavedAt이 더 작음)이 최신 진행을 덮어쓰지 않도록 무시한다.
    # SQLite는 외래 키를 강제하지 않아, 없는 계정의 user_id로도 저장 행이 생겼다 (랭킹에 유령 행이 섞임)
    if not db.query(models.User.id).filter(models.User.id == payload.user_id).first():
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다.")
    data_json = json.dumps(payload.data)
    saved_at = payload.data.get("lastSavedAt")
    if not isinstance(saved_at, (int, float)) or isinstance(saved_at, bool):
        saved_at = None  # 시각 정보가 없으면 예전처럼 무조건 덮어씀

    updated = _update_if_not_older(db, payload.user_id, data_json, saved_at)
    if not updated:
        exists = db.query(models.GameSave.id).filter(models.GameSave.user_id == payload.user_id).first()
        if not exists:
            db.add(models.GameSave(user_id=payload.user_id, data=data_json))
            try:
                db.commit()
            except IntegrityError:
                # 같은 계정의 첫 저장이 동시에 들어와 다른 요청이 먼저 행을 만든 경우
                db.rollback()
                _update_if_not_older(db, payload.user_id, data_json, saved_at)
    db.commit()

    save = db.query(models.GameSave).filter(models.GameSave.user_id == payload.user_id).first()
    return schemas.SaveResponse(user_id=save.user_id, data=json.loads(save.data))


# 주간 랭킹은 익명으로 보여준다: 실제 닉네임 대신 아래 이름 중 하나를 응답에 넣고,
# 요청한 본인 행에만 isMe를 표시한다. (실제 닉네임은 랭킹 응답에 아예 포함하지 않음)
WEEKLY_RANKING_LIMIT_MAX = 100

RANKING_ALIASES = [
    "홍길동", "개똥이", "철수", "영희", "돌쇠", "마당쇠", "갑돌이", "갑순이", "순돌이", "삼순이",
    "말순이", "복순이", "덕구", "막둥이", "꺽정이", "춘향이", "몽룡이", "심청이", "흥부", "놀부",
    "콩쥐", "팥쥐", "바우", "칠복이", "점순이", "판돌이", "언년이", "봉구", "만복이", "복동이",
    "차돌이", "똘이", "꽃분이", "금순이", "옥분이", "봉순이", "길순이", "용팔이", "덕배", "만수",
    "칠성이", "삼돌이", "귀남이", "복실이", "쇠돌이", "억쇠", "순덕이", "말똥이", "곱단이", "또순이",
    "허수아비", "참새", "메뚜기", "우렁이", "미꾸라지", "개구리", "두루미", "황소", "누렁이", "바둑이",
    "흰둥이", "까치", "제비", "올챙이", "반딧불이", "다람쥐", "고슴도치", "부엉이", "두더지", "청개구리",
    "누룽지", "주먹밥", "인절미", "가래떡", "꿀떡", "송편", "백설기", "시루떡", "약과", "강정",
    "볍씨", "모내기", "벼이삭", "논두렁", "새참", "막걸리", "쌀가마", "짚신", "멍석", "디딜방아",
    "절구", "키질", "지게", "도롱이", "삽살개", "진돗개", "꼬꼬닭", "병아리", "오리", "거위",
]

ALIAS_SALT_PATH = Path(__file__).resolve().parent / "ranking_alias_salt.txt"


def _load_alias_salt() -> str:
    """익명 이름을 정하는 비밀값. 코드만 보고 user_id → 익명 이름을 계산할 수 없도록 저장소 밖에 둔다.
    환경변수 RANKING_ALIAS_SALT가 있으면 그 값을, 없으면 backend/ranking_alias_salt.txt를 쓴다(없으면 새로 만듦)."""
    salt = os.environ.get("RANKING_ALIAS_SALT", "").strip()
    if salt:
        return salt
    if ALIAS_SALT_PATH.exists():
        salt = ALIAS_SALT_PATH.read_text(encoding="utf-8").strip()
    if not salt:
        salt = secrets.token_hex(16)
        ALIAS_SALT_PATH.write_text(salt, encoding="utf-8")
    return salt


_ALIAS_SALT = _load_alias_salt()


def _assign_weekly_aliases(user_ids, week_key: str) -> dict:
    """주차별 익명 이름 {user_id: 이름}. 같은 주 안에서는 고정되고(순위가 바뀌어도 이름 유지) 주가 바뀌면 새로 섞인다.
    이름이 겹치면 다음 빈 이름을 쓰고, 후보가 모두 쓰였으면 뒤에 번호를 붙인다."""
    aliases = {}
    taken = set()
    count = len(RANKING_ALIASES)
    # user_id 순서로 배정 → 새 계정이 생겨도 기존 사용자의 이번 주 이름은 바뀌지 않음
    for user_id in sorted(user_ids):
        digest = hashlib.sha256(f"{_ALIAS_SALT}:{week_key}:{user_id}".encode("utf-8")).digest()
        start = int.from_bytes(digest[:4], "big") % count
        alias = next(
            (RANKING_ALIASES[(start + step) % count] for step in range(count)
             if RANKING_ALIASES[(start + step) % count] not in taken),
            None,
        )
        if alias is None:
            number = 2
            while f"{RANKING_ALIASES[start]}{number}" in taken:
                number += 1
            alias = f"{RANKING_ALIASES[start]}{number}"
        taken.add(alias)
        aliases[user_id] = alias
    return aliases


def _extract_weekly_harvest(data: dict) -> float:
    """저장된 weekKey가 이번 주와 다르면(그 사이 접속을 안 해서 리셋이 안 된 경우)
    랭킹 계산에서는 0으로 취급한다. 클라이언트는 다음 접속 시 자체적으로 리셋한다."""
    if data.get("weekKey") != get_current_week_key():
        return 0.0
    return float(data.get("weeklyHarvest") or 0)


@app.get("/leaderboard/weekly", response_model=schemas.WeeklyLeaderboardResponse)
def get_weekly_leaderboard(limit: int = WEEKLY_RANKING_LIMIT_MAX, user_id: int | None = None, db: Session = Depends(get_db)):
    limit = max(1, min(limit, WEEKLY_RANKING_LIMIT_MAX))
    # 계정이 있는 저장만 (예전에 생긴 계정 없는 저장 행은 제외)
    saves = db.query(models.GameSave).join(models.User, models.GameSave.user_id == models.User.id).all()

    ranked = []
    for save in saves:
        try:
            data = json.loads(save.data)
        except (TypeError, ValueError):
            continue
        ranked.append({"user_id": save.user_id, "weeklyHarvest": _extract_weekly_harvest(data)})

    ranked.sort(key=lambda entry: entry["weeklyHarvest"], reverse=True)
    aliases = _assign_weekly_aliases([entry["user_id"] for entry in ranked], get_current_week_key())

    def to_entry(rank: int, entry: dict) -> schemas.WeeklyLeaderboardEntry:
        return schemas.WeeklyLeaderboardEntry(
            rank=rank,
            alias=aliases[entry["user_id"]],
            weeklyHarvest=entry["weeklyHarvest"],
            isMe=user_id is not None and entry["user_id"] == user_id,
        )

    entries = [to_entry(index + 1, entry) for index, entry in enumerate(ranked[:limit])]
    my_entry = next(
        (to_entry(index + 1, entry) for index, entry in enumerate(ranked) if user_id is not None and entry["user_id"] == user_id),
        None,
    )
    return schemas.WeeklyLeaderboardResponse(entries=entries, myEntry=my_entry)


@app.get("/friends/search", response_model=schemas.FriendSearchResult)
def search_friend_by_code(code: str, db: Session = Depends(get_db)):
    target = db.query(models.User).filter(models.User.friend_code == code.strip().upper()).first()
    if not target:
        raise HTTPException(status_code=404, detail="해당 친구 코드의 사용자를 찾을 수 없습니다.")
    return schemas.FriendSearchResult(user_id=target.id, nickname=target.nickname, friend_code=target.friend_code)


@app.post("/friends/request")
def send_friend_request(payload: schemas.FriendRequestCreate, db: Session = Depends(get_db)):
    requester = db.query(models.User).filter(models.User.id == payload.requester_id).first()
    if not requester:
        raise HTTPException(status_code=404, detail="요청자 계정을 찾을 수 없습니다.")

    target = db.query(models.User).filter(models.User.friend_code == payload.target_friend_code.strip().upper()).first()
    if not target:
        raise HTTPException(status_code=404, detail="해당 친구 코드의 사용자를 찾을 수 없습니다.")
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
        weekly_harvest = 0.0
        if save:
            try:
                data = json.loads(save.data)
                consumed = float(data.get("consumed") or 0)
                weekly_harvest = _extract_weekly_harvest(data)
            except (TypeError, ValueError):
                pass
        level_info = get_level_by_consumed(consumed)
        entries.append(
            schemas.FriendEntry(
                user_id=user.id,
                nickname=user.nickname,
                gameLevel=level_info["level"],
                gameLevelTitle=level_info["title"],
                weeklyHarvest=weekly_harvest,
            )
        )

    entries.sort(key=lambda entry: entry.weeklyHarvest, reverse=True)
    return schemas.FriendListResponse(friends=entries)


