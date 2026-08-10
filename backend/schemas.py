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

    class Config:
        from_attributes = True  # SQLAlchemy 모델 객체를 그대로 응답에 변환 허용
