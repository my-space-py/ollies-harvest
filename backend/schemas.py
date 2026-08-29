from typing import Any

from pydantic import BaseModel, Field


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=20, description="아이디")
    nickname: str = Field(min_length=1, max_length=20, description="닉네임")
    password: str = Field(min_length=4, max_length=64, description="비밀번호")


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    nickname: str
    friend_code: str

    class Config:
        from_attributes = True  # SQLAlchemy 모델 객체를 그대로 응답에 변환 허용


class SaveRequest(BaseModel):
    user_id: int
    data: dict[str, Any] = Field(description="프론트 게임 상태 객체 전체 (JSON)")


class SaveResponse(BaseModel):
    user_id: int
    data: dict[str, Any]


class LeaderboardEntry(BaseModel):
    rank: int
    nickname: str
    consumed: float


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]


class WeeklyLeaderboardEntry(BaseModel):
    rank: int
    nickname: str
    weeklyHarvest: float


class WeeklyLeaderboardResponse(BaseModel):
    entries: list[WeeklyLeaderboardEntry]
    myEntry: WeeklyLeaderboardEntry | None = None


class FriendSearchResult(BaseModel):
    user_id: int
    nickname: str
    friend_code: str


class FriendRequestCreate(BaseModel):
    requester_id: int
    target_friend_code: str


class FriendRequestAction(BaseModel):
    user_id: int
    request_id: int


class FriendRequestEntry(BaseModel):
    request_id: int
    requester_id: int
    requester_nickname: str


class FriendRequestListResponse(BaseModel):
    requests: list[FriendRequestEntry]


class FriendEntry(BaseModel):
    user_id: int
    nickname: str
    gameLevel: int
    gameLevelTitle: str
    weeklyHarvest: float


class FriendListResponse(BaseModel):
    friends: list[FriendEntry]
