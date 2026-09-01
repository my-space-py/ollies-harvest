// ============================================================================
// 올리의 수확 — 밸런스 설정 파일
// ----------------------------------------------------------------------------
// 이 파일의 숫자들은 전부 "초기 기준값"입니다. 실제 플레이 테스트 후
// 전체 플레이 기간이 목표(약 7일)에 가까워지도록 이 파일의 값만 조정하면 됩니다.
// game.js 등 로직 코드에는 밸런스 수치를 직접 박아 넣지 않습니다.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. 게임 전체 LV (1~12) — 누적 쌀 소비량 기준 마일스톤
// ----------------------------------------------------------------------------
// title은 UI에 "LV.5 초보자" 형태로 표시되는 호칭입니다.
// reward는 해당 LV 최초 달성 시 1회 지급되는 보상입니다.
//   type: "none" | "booster" | "clickPermanent" | "autoPermanent" | "allPermanent" | "unlockFlag"
const GAME_LEVELS = [
  { level: 1, requiredConsumed: 0, title: "새싹 농부", reward: { type: "none" } },
  { level: 2, requiredConsumed: 1000, title: "논밭 견습생", reward: { type: "booster", amount: 1 } },
  { level: 3, requiredConsumed: 5000, title: "성실한 농부", reward: { type: "booster", amount: 1 } },
  { level: 4, requiredConsumed: 25000, title: "능숙한 농부", reward: { type: "booster", amount: 1 } },
  { level: 5, requiredConsumed: 125000, title: "마을의 일꾼", reward: { type: "booster", amount: 1 } },
  { level: 6, requiredConsumed: 1000000, title: "들녘의 달인", reward: { type: "clickPermanent", amount: 0.05, label: "클릭 수확 영구 +5%" } },
  { level: 7, requiredConsumed: 10000000, title: "풍년 농부", reward: { type: "booster", amount: 2 } },
  { level: 8, requiredConsumed: 110000000, title: "황금 들녘의 주인", reward: { type: "unlockFlag", flag: "clickEffectTier2", label: "화려한 클릭 이펙트 해금" } },
  { level: 9, requiredConsumed: 1200000000, title: "전설의 농부", reward: { type: "autoPermanent", amount: 0.05, label: "자동수확 영구 +5%" } },
  { level: 10, requiredConsumed: 13000000000, title: "천년 농부", reward: { type: "unlockFlag", flag: "specialBackground", label: "특별 배경/꾸미기 요소 해금" } },
  { level: 11, requiredConsumed: 145000000000, title: "농신의 계승자", reward: { type: "boosterMultiplierBonus", amount: 0.2, label: "부스터 효과 +20%" } },
  { level: 12, requiredConsumed: 1600000000000, title: "신농", reward: { type: "allPermanent", amount: 0.1, label: "전체 수확량 영구 +10%", finalTitle: true } },
];

const MAX_GAME_LEVEL = GAME_LEVELS.length;

// ----------------------------------------------------------------------------
// 2. 수확 장비 트랙 (수동 / 자동), 각 12티어
// ----------------------------------------------------------------------------
// basePower = 티어 Lv.1 기준 생산량 (수동=클릭당, 자동=초당)
// costMultiplierPerTier = 티어별 Lv.1 업그레이드 비용을 basePower의 몇 배로 잡을지
//   (신규 티어 Lv.1 구매가 기존 티어를 계속 강화하는 것보다 확실히 이득이 되도록
//    적당히 낮게 잡되, 플레이 테스트로 조정 가능)
const TOOL_TIER_NAMES = {
  click: [
    "맨손 모내기", "모종삽", "농사용 호미", "강철 호미", "수확용 낫", "양손 수확낫",
    "손탈곡기", "농사왕의 호미", "황금 들녘의 낫", "풍년 장군의 벼훑이", "천년 농부의 손길", "신농의 수확도구",
  ],
  auto: [
    "물길", "자동 물주기 호스", "논 스프링클러", "자동 비료 살포기", "소형 이앙기", "자동 탈곡기",
    "스마트 콤바인", "풍년의 자동농장", "황금 들녘 제어탑", "천년 수확 엔진", "농신의 무인농장", "무한 풍년 코어",
  ],
};

// BasePower(Tier) = 5^(Tier-1) — 기획서 7·8장 표와 동일
function tierBasePower(tier) {
  return 5 ** (tier - 1);
}

const TOOL_CONFIG = {
  click: {
    tierCount: 12,
    costMultiplierPerTier: 20, // T1 Lv.1 업그레이드 비용 = 1 × 20 = 20
    innerLevelGrowth: 0.2, // 내부 Lv +1당 티어 기본생산량의 20%씩 선형 증가
    costGrowthPerLevel: 1.45, // 내부 업그레이드 비용은 매 레벨 45%씩 증가
  },
  auto: {
    tierCount: 12,
    costMultiplierPerTier: 15,
    innerLevelGrowth: 0.2,
    costGrowthPerLevel: 1.45,
  },
};

// ----------------------------------------------------------------------------
// 3. 레시피 (5종 고정) — 인기도는 내부 재화로만 유지, 화면에 크게 노출하지 않음
// ----------------------------------------------------------------------------
// cost: 1개 소비 시 쌀알 소비량 (수량 선택 시 qty배)
// unlockPopularity: 해금에 필요한 인기도 (내부 재화)
// popularity: 1회 사용 시 획득 인기도
// buff: 타임 버프 { type: 'click' | 'auto', multiplier, duration(초) }
// autoMultiplierBonus: 영구 자동수확 배율 보너스(1회당, qty배 적용)
const RECIPES = [
  {
    id: "meal", name: "밥 짓기", icon: "./assets/images/recipes/recipe_rice_bowl.png",
    cost: 150, unlockPopularity: 0, popularity: 3,
    note: "부스터 지속시간 +10%(1회 사용당 20초, 최대 누적 없음)",
    message: "올리가 따뜻한 밥 한 그릇을 지었어요.",
    boosterDurationBonusSeconds: 20,
  },
  {
    id: "kimbap", name: "김밥 만들기", icon: "./assets/images/recipes/recipe_kimbap.png",
    cost: 120, unlockPopularity: 10, popularity: 4,
    buff: { type: "click", multiplier: 1.5, duration: 30 },
    note: "30초간 클릭 수확 +50%",
    message: "올리의 김밥이 소풍길에 인기를 얻었어요.",
  },
  {
    id: "tteok", name: "떡 만들기", icon: "./assets/images/recipes/recipe_tteok.png",
    cost: 250, unlockPopularity: 25, popularity: 8,
    buff: { type: "auto", multiplier: 1.5, duration: 30 },
    note: "30초간 자동 수확 +50%",
    message: "마을 사람들이 떡을 나누며 올리를 도와주기 시작했어요.",
  },
  {
    id: "bread", name: "쌀빵 굽기", icon: "./assets/images/recipes/recipe_rice_bread.png",
    cost: 300, unlockPopularity: 45, popularity: 15,
    note: "부스터 지속시간 추가 증가(1회 사용당 40초)",
    message: "쌀빵이 새 손님들의 관심을 끌었어요.",
    boosterDurationBonusSeconds: 40,
  },
  {
    id: "nurungji", name: "누룽지 만들기", icon: "./assets/images/recipes/recipe_nurungji.png",
    cost: 200, unlockPopularity: 70, popularity: 6,
    buff: { type: "all", multiplier: 1.3, duration: 45 },
    note: "45초간 전체 생산량 +30%",
    message: "남은 밥도 고소한 누룽지가 되었어요.",
  },
];

const RECIPE_QUANTITY_OPTIONS = [1, 10, 100, "MAX"];

// ----------------------------------------------------------------------------
// 4. 비료 부스터
// ----------------------------------------------------------------------------
const BOOSTER_CONFIG = {
  baseMultiplier: 2,
  baseDurationSeconds: 60,
};

// ----------------------------------------------------------------------------
// 5. 오프라인 자동수확
// ----------------------------------------------------------------------------
const OFFLINE_MAX_SECONDS = 24 * 60 * 60; // 24시간

// ----------------------------------------------------------------------------
// 6. 누적 쌀 소비량 기반 배경 성장 (5단계)
// ----------------------------------------------------------------------------
const BACKGROUND_STAGES = [
  { stage: 1, name: "작은 논", threshold: 0, scene: "farm" },
  { stage: 2, name: "풍년 들판", threshold: 5000, scene: "farm" },
  { stage: 3, name: "농가", threshold: 125000, scene: "village" },
  { stage: 4, name: "농촌 마을", threshold: 10000000, scene: "village" },
  { stage: 5, name: "수확 축제", threshold: 1200000000, scene: "festival" },
];

// ----------------------------------------------------------------------------
// 7. 오늘의 미션 (일일 리셋) — 쌀알 직접 보상은 지급하지 않음(비료/특수 보상만)
// ----------------------------------------------------------------------------
// type: 진행도를 어떤 카운터로 추적할지 ('click' | 'upgrade' | 'recipe' | 'boosterUse')
const DAILY_MISSIONS = [
  { id: "dailyClick", name: "부지런한 손", conditionText: "클릭 30회", type: "click", target: 30, reward: { type: "booster", amount: 1, label: "비료 부스터 +1" } },
  { id: "dailyUpgrade", name: "농기구 정비", conditionText: "업그레이드 1회", type: "upgrade", target: 1, reward: { type: "booster", amount: 1, label: "비료 부스터 +1" } },
  { id: "dailyRecipe", name: "오늘의 밥상", conditionText: "레시피 3회 사용", type: "recipe", target: 3, reward: { type: "booster", amount: 2, label: "비료 부스터 +2" } },
  { id: "dailyBooster", name: "비료 뿌리기", conditionText: "부스터 1회 사용", type: "boosterUse", target: 1, reward: { type: "popularity", amount: 10, label: "인기도 +10" } },
];

// ----------------------------------------------------------------------------
// 8. 주간 랭킹 — ISO 주(월요일 시작) 기준 키. 프론트/백엔드(game_levels.py) 동일 알고리즘.
// ----------------------------------------------------------------------------
function getISOWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// ----------------------------------------------------------------------------
// 9. 출석 보상 (7일 한정, 반복 없음) — 기획서 12.7 "7일 출석판" 요구사항
// ----------------------------------------------------------------------------
// 로컬 날짜가 바뀔 때마다(연속 접속 여부와 무관) 하루씩 카운트가 올라가고,
// 그날 칸을 눌러 보상을 받는다. 7일차를 받으면 출석판은 완료 상태로 끝나고
// 반복(리셋)되지 않는다. 초반에는 쌀알로 즉시 체감되는 보상을, 후반에는
// 비료 부스터/인기도 위주로 지급해 이미 자리 잡은 다른 보상 체계와 균형을 맞춘다.
const ATTENDANCE_REWARDS = [
  { day: 1, type: "rice", amount: 30, label: "쌀알 +30g" },
  { day: 2, type: "rice", amount: 80, label: "쌀알 +80g" },
  { day: 3, type: "booster", amount: 1, label: "비료 부스터 +1" },
  { day: 4, type: "popularity", amount: 8, label: "인기도 +8" },
  { day: 5, type: "rice", amount: 200, label: "쌀알 +200g" },
  { day: 6, type: "booster", amount: 2, label: "비료 부스터 +2" },
  { day: 7, type: "boosterPopularity", amount: 3, popularityAmount: 15, label: "비료 부스터 +3, 인기도 +15", isFinal: true },
];

// ----------------------------------------------------------------------------
// 10. 홈 화면 매일 랜덤 문구 (날짜 기준 고정 — 같은 날엔 항상 같은 문구가 나오고, 자정이 지나면 바뀜)
// ----------------------------------------------------------------------------
const DAILY_PHRASES = [
  "오늘 아침밥, 우리쌀로 시작하세요",
  "한 그릇의 밥, 하루의 힘이 됩니다",
  "갓 지은 밥 냄새, 오늘도 맡아볼까요?",
  "쌀 한 톨에 담긴 정성을 기억해요",
  "오늘 점심은 든든한 쌀밥 어때요?",
  "밥심으로 버티는 하루, 올리와 함께",
  "우리 쌀로 만든 밥, 더 맛있어요",
  "김이 모락모락, 갓 지은 밥 한 공기",
  "쌀밥 한 그릇이면 세상 부러울 게 없죠",
  "오늘도 쌀 한 톨의 소중함을 느껴봐요",
  "밥 한 숟갈에 담긴 농부의 땀방울",
  "든든한 쌀밥으로 활기찬 하루 시작해요",
  "우리 논에서 자란 쌀, 우리 밥상에서 빛나요",
  "밥 잘 먹는 하루가 좋은 하루예요",
  "갓 지은 밥처럼 따뜻한 하루 되세요",
  "쌀알 하나하나에 여름 햇살이 담겨있어요",
  "오늘 저녁, 쌀밥으로 마무리해볼까요?",
  "밥 한 그릇의 행복, 잊지 마세요",
  "우리쌀 소비가 곧 우리 농촌을 지키는 일이에요",
  "갓 지은 쌀밥, 오늘의 작은 사치",
  "쌀로 만든 간식도 정말 맛있어요",
  "누룽지 한 조각, 추억을 소환해요",
  "떡 한 입에 담긴 쌀의 달콤함",
  "김밥 한 줄로 기분 좋은 하루 시작",
  "쌀빵의 부드러움, 한 번 느껴보세요",
  "오늘은 쌀로 만든 요리에 도전해볼까요?",
  "밥 한 공기가 주는 든든함을 잊지 마세요",
  "우리 쌀, 우리 힘으로 지켜요",
  "쌀 소비가 늘면 농부의 미소도 늘어나요",
  "매일 한 숟갈씩, 쌀 사랑을 실천해요",
  "오늘의 한 끼, 쌀로 채워보세요",
  "밥 한 그릇에 담긴 작은 행복을 찾아보세요",
  "쌀밥은 언제 먹어도 옳다",
  "갓 지은 밥 한 공기, 오늘의 힐링",
  "우리 쌀로 오늘 하루도 든든하게",
  "쌀알처럼 작지만 소중한 오늘을 보내요",
  "밥맛 좋은 하루, 올리와 함께 만들어요",
  "오늘도 쌀 한 톨 남기지 않기",
  "쌀 한 가마니엔 농부의 한 해가 담겨있어요",
  "따뜻한 밥 한 그릇, 마음까지 데워줘요",
  "쌀로 채운 하루, 더 풍성해져요",
  "오늘의 수확, 내일의 밥상이 됩니다",
  "쌀밥 한 그릇의 든든함, 잊지 마세요",
  "우리 땅에서 자란 쌀, 우리 몸에도 좋아요",
  "밥 한 끼의 정성, 쌀 한 톨부터 시작돼요",
  "오늘 하루도 쌀심으로 힘내봐요",
  "쌀은 밥이 되고, 밥은 힘이 됩니다",
  "갓 지은 밥 한 그릇, 오늘의 선물",
  "쌀 한 톨의 여정, 올리와 함께 이어가요",
  "오늘도 우리쌀로 맛있는 하루 만들어요",
];

function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getDailyPhrase(dateKey = getLocalDateKey()) {
  const index = hashStringToInt(dateKey) % DAILY_PHRASES.length;
  return DAILY_PHRASES[index];
}
function getGameLevelInfo(level) {
  return GAME_LEVELS.find((entry) => entry.level === level) || GAME_LEVELS[0];
}

function getGameLevelByConsumed(consumed) {
  let current = GAME_LEVELS[0];
  for (const entry of GAME_LEVELS) {
    if (consumed >= entry.requiredConsumed) current = entry;
    else break;
  }
  return current;
}

function getNextGameLevel(level) {
  return GAME_LEVELS.find((entry) => entry.level === level + 1) || null;
}
