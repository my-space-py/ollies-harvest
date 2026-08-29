# frontend/js/balance-config.js의 GAME_LEVELS와 반드시 동일하게 유지해야 하는 미러 설정.
# 프론트/백엔드가 서로 다른 언어라 공유 파일을 쓸 수 없어 부득이하게 값을 복제한다.
# 밸런스(임계값/호칭)를 바꿀 때는 balance-config.js와 이 파일을 함께 수정해야 한다.

GAME_LEVELS = [
    {"level": 1, "requiredConsumed": 0, "title": "새싹 농부"},
    {"level": 2, "requiredConsumed": 1000, "title": "논밭 견습생"},
    {"level": 3, "requiredConsumed": 5000, "title": "성실한 농부"},
    {"level": 4, "requiredConsumed": 25000, "title": "능숙한 농부"},
    {"level": 5, "requiredConsumed": 125000, "title": "마을의 일꾼"},
    {"level": 6, "requiredConsumed": 1000000, "title": "들녘의 달인"},
    {"level": 7, "requiredConsumed": 10000000, "title": "풍년 농부"},
    {"level": 8, "requiredConsumed": 110000000, "title": "황금 들녘의 주인"},
    {"level": 9, "requiredConsumed": 1200000000, "title": "전설의 농부"},
    {"level": 10, "requiredConsumed": 13000000000, "title": "천년 농부"},
    {"level": 11, "requiredConsumed": 145000000000, "title": "농신의 계승자"},
    {"level": 12, "requiredConsumed": 1600000000000, "title": "신농"},
]


def get_level_by_consumed(consumed: float):
    current = GAME_LEVELS[0]
    for entry in GAME_LEVELS:
        if consumed >= entry["requiredConsumed"]:
            current = entry
        else:
            break
    return current


def get_current_week_key():
    """ISO 주차 기준 키 (예: '2026-W35'). 프론트 game.js의 getISOWeekKey()와 동일한 알고리즘."""
    import datetime

    year, week, _ = datetime.datetime.utcnow().isocalendar()
    return f"{year}-W{week:02d}"
