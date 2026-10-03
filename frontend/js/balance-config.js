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

// BasePower(Tier) = 4.5^(Tier-1)
// (2026-10-01) 기획서의 5^(Tier-1)에서 낮춤. 고레벨일수록 영구 보너스·레시피 버프·비료가 곱으로 쌓여
// LV3 이후 레벨당 0~2분이면 오르던 문제를, 티어 간 생산량 차이를 줄여 상쇄한다.
function tierBasePower(tier) {
  return 4.5 ** (tier - 1);
}

// 비용은 모두 tierBasePower에 비례 → 어느 티어에서든 "몇 분치 수입"으로 같은 노력이 든다.
const TOOL_CONFIG = {
  click: {
    tierCount: 12,
    costMultiplierPerTier: 20, // 내부 강화 비용 기준: T1 Lv.1 → 2 = 1 × 20 = 20
    tierCostMultiplier: 4000, // 다음 티어 교체 비용 = 4000 × 다음 티어 basePower (예전엔 내부 강화와 같은 20배라 사실상 공짜)
    innerLevelGrowth: 0.2, // 내부 Lv +1당 티어 기본생산량의 20%씩 선형 증가
    costGrowthPerLevel: 1.45, // 내부 업그레이드 비용은 매 레벨 45%씩 증가
  },
  auto: {
    tierCount: 12,
    costMultiplierPerTier: 15,
    tierCostMultiplier: 3000,
    innerLevelGrowth: 0.2,
    costGrowthPerLevel: 1.45,
  },
};

// ----------------------------------------------------------------------------
// 3. 레시피 (5종 고정) — 누적 쌀 소비량으로 해금
// ----------------------------------------------------------------------------
// cost: 1개 소비 시 쌀알 소비량 (수량 선택 시 qty배)
// unlockConsumed: 해금에 필요한 누적 쌀 소비량(g)
// buff: 배율은 고정, duration(초) × 제작 수량만큼 남은 시간에 누적
// boosterDurationBonusSeconds: 다음 부스터 1회에 사용할 추가 시간(수량 비례)
// boosterMultiplierBonus: 다음 부스터 배율 가산값(수량만큼 강화 사용 횟수 적립)
const RECIPES = [
  {
    id: "meal", name: "밥 짓기", icon: "./assets/images/recipes/recipe_rice_bowl.png",
    cost: 150, unlockConsumed: 0,
    message: "올리가 따뜻한 밥 한 그릇을 지었어요.",
    boosterDurationBonusSeconds: 60,
  },
  {
    id: "kimbap", name: "김밥 만들기", icon: "./assets/images/recipes/recipe_kimbap.png",
    cost: 120, unlockConsumed: 600,
    buff: { type: "click", multiplier: 3, duration: 30 },
    message: "올리의 김밥이 소풍길에 인기를 얻었어요.",
  },
  {
    id: "tteok", name: "떡 만들기", icon: "./assets/images/recipes/recipe_tteok.png",
    cost: 250, unlockConsumed: 1200,
    buff: { type: "auto", multiplier: 3, duration: 30 },
    message: "마을 사람들이 떡을 나누며 올리를 도와주기 시작했어요.",
  },
  {
    id: "bread", name: "쌀빵 굽기", icon: "./assets/images/recipes/recipe_rice_bread.png",
    cost: 300, unlockConsumed: 2500,
    message: "쌀빵이 새 손님들의 관심을 끌었어요.",
    boosterMultiplierBonus: 0.5,
  },
  {
    id: "nurungji", name: "누룽지 만들기", icon: "./assets/images/recipes/recipe_nurungji.png",
    cost: 200, unlockConsumed: 5000,
    buff: { type: "all", multiplier: 2, duration: 45 },
    message: "남은 밥도 고소한 누룽지가 되었어요.",
  },
  // ---- 중·후반 레시피 (2026-09-29 추가). 이미지 파일이 없으면 emoji로 대신 표시 ----
  {
    // 버프 동안 클릭마다 chance 확률로 클릭 수확량 ×multiplier "대박 수확"
    id: "jumeokbap", name: "주먹밥 만들기", icon: "./assets/images/recipes/recipe_jumeokbap.png", emoji: "🍙",
    cost: 1000, unlockConsumed: 20000,
    buff: { type: "crit", multiplier: 10, chance: 0.1, duration: 60 },
    message: "든든한 주먹밥을 먹은 올리의 손끝에 힘이 넘쳐요!",
  },
  {
    // 오프라인(쉬는 동안) 수확 효율 영구 +5%/개, 최대 +100%
    id: "sikhye", name: "식혜 만들기", icon: "./assets/images/recipes/recipe_sikhye.png", emoji: "🥤",
    cost: 5000, unlockConsumed: 100000,
    offlineBonus: 0.05,
    message: "시원한 식혜 덕분에 쉬는 동안에도 일손이 척척이에요.",
  },
  {
    // 간식 나눔: 이 레시피로 쓴 양의 +50%를 누적 소비량으로 추가 인정 (쌀알은 돌려주지 않음)
    id: "ssalgwaja", name: "쌀과자 굽기", icon: "./assets/images/recipes/recipe_ssalgwaja.png", emoji: "🍘",
    cost: 20000, unlockConsumed: 500000,
    consumedBonusRate: 0.5,
    message: "바삭한 쌀과자를 이웃과 나눠 먹었어요.",
  },
  {
    // 다음 게임 LV 보상 2배 (1개당 1회 적립, 남은 LV 수까지)
    id: "tteokguk", name: "떡국 끓이기", icon: "./assets/images/recipes/recipe_tteokguk.png", emoji: "🍲",
    cost: 100000, unlockConsumed: 2500000,
    levelRewardDouble: 1,
    message: "떡국 한 그릇에 한 살 더! 다음 성장이 더 풍성해져요.",
  },
  {
    // 지금 켜져 있는 레시피 버프(김밥·떡·누룽지·주먹밥)의 남은 시간 +30초/개
    id: "bibimbap", name: "비빔밥 비비기", icon: "./assets/images/recipes/recipe_bibimbap.png", emoji: "🥣",
    cost: 500000, unlockConsumed: 10000000,
    extendBuffSeconds: 30,
    message: "골고루 비빈 비빔밥처럼 모든 효과가 오래가요.",
  },
  {
    // 비료 부스터 +1/개, 하루 최대 dailyCap개까지 지급 (넘는 수량은 소비만 인정)
    id: "ssalguksu", name: "쌀국수 삶기", icon: "./assets/images/recipes/recipe_ssalguksu.png", emoji: "🍜",
    cost: 2000000, unlockConsumed: 50000000,
    boosterGrant: { amount: 1, dailyCap: 5 },
    message: "쫄깃한 쌀국수를 팔아 비료를 마련했어요.",
  },
];

// 식혜 영구 오프라인 보너스 상한 (+100%)
const OFFLINE_BONUS_MAX = 1;

// ----------------------------------------------------------------------------
// 3-1. 잔치 — 큰 양을 한 번에 소비하고 영구 보상. 앞 단계를 연 뒤에 다음 단계가 열림(1회성)
// ----------------------------------------------------------------------------
// reward.type: clickPermanent | autoPermanent | allPermanent (+ flag: 해금 플래그)
const FEASTS = [
  {
    id: "neighborhood", name: "동네 밥상", icon: "./assets/images/feasts/feast_neighborhood.png", emoji: "🏠",
    cost: 30000, reward: { type: "allPermanent", amount: 0.05, label: "전체 수확 영구 +5%" },
    message: "이웃들과 둘러앉아 따뜻한 밥상을 나눴어요.",
  },
  {
    id: "schoolLunch", name: "학교 급식 지원", icon: "./assets/images/feasts/feast_school_lunch.png", emoji: "🏫",
    cost: 1000000, reward: { type: "autoPermanent", amount: 0.1, label: "자동 수확 영구 +10%" },
    message: "아이들이 우리 쌀로 지은 급식을 맛있게 먹었어요.",
  },
  {
    id: "smallFestival", name: "작은 쌀 축제", icon: "./assets/images/feasts/feast_small_festival.png", emoji: "🎪",
    cost: 50000000, reward: { type: "allPermanent", amount: 0.1, flag: "festivalScene", label: "전체 수확 영구 +10% · 축제 배경" },
    message: "작은 논에서 시작된 수확이 모두의 축제가 되었어요!",
  },
  {
    id: "regionalFestival", name: "지역 대표 쌀 축제", icon: "./assets/images/feasts/feast_regional_festival.png", emoji: "🏆",
    cost: 5000000000, reward: { type: "allPermanent", amount: 0.15, flag: "regionalFestival", label: "전체 수확 영구 +15% · 축제 배지" },
    message: "올리의 쌀 축제가 지역을 대표하는 축제가 되었어요!",
  },
];

// ----------------------------------------------------------------------------
// 3-2. 쌀 기부(푸드뱅크) — 보유 쌀알의 일부를 기부 → 누적 소비량으로 인정, 누적 기부량 배지
// ----------------------------------------------------------------------------
const DONATION_CONFIG = {
  ratios: [0.1, 0.25, 0.5, 1], // 선택 버튼 (보유량 대비)
  minAmount: 100, // 이보다 적으면 기부 불가(g)
  icon: "./assets/images/sharing/donation_box.png", emoji: "🎁",
};

const DONATION_BADGES = [
  { id: "d1", amount: 10000, name: "새싹 나눔이", icon: "./assets/images/sharing/badge_donation_1.png", emoji: "🌱", reward: { booster: 1 } },
  { id: "d2", amount: 1000000, name: "따뜻한 이웃", icon: "./assets/images/sharing/badge_donation_2.png", emoji: "💛", reward: { booster: 3 } },
  { id: "d3", amount: 100000000, name: "나눔 농부", icon: "./assets/images/sharing/badge_donation_3.png", emoji: "🧺", reward: { booster: 5 } },
  { id: "d4", amount: 10000000000, name: "나눔의 전설", icon: "./assets/images/sharing/badge_donation_4.png", emoji: "👑", reward: { booster: 10 } },
];

// ----------------------------------------------------------------------------
// 3-3. 주문 배달 — 무작위 손님이 해금된 레시피 N개를 주문. 제한 시간 안에 납품하면 대금 지급
// ----------------------------------------------------------------------------
// 수량은 "지금 자동 생산량의 minSeconds~maxSeconds초치" 쌀이 들도록 정해져 진행 단계에 맞게 커짐
// 대금 = 납품에 쓴 쌀 × rewardRate. boosterChance 확률로 비료 부스터 +1 추가
const ORDER_CONFIG = {
  timeLimitSeconds: 300,
  cooldownSeconds: 60, // 납품·만료·거절 후 다음 주문까지
  minSeconds: 60,
  maxSeconds: 180,
  minQty: 3,
  rewardRate: 1.5,
  boosterChance: 0.2,
  icon: "./assets/images/sharing/order_delivery.png", emoji: "📦",
  customers: ["마을 식당", "학교 매점", "동네 잔칫집", "등산객 쉼터", "한옥 카페", "시장 분식집"],
};

const RECIPE_QUANTITY_OPTIONS = [1, 10, 100, "MAX"];

// 숫자 정밀도 보호용 상한. MAX 제작/소비 수량 자체에는 제한을 두지 않습니다.
const MAX_EFFECT_TIMESTAMP = Number.MAX_SAFE_INTEGER;
const MAX_PENDING_SECONDS = Math.floor(Number.MAX_SAFE_INTEGER / 1000);

// 소비 마일스톤: 기존 m1/m5/m10/m20 ID 유지 → 수령 보상 중복 지급 방지.
// 삭제된 m30 수령 기록은 기존 저장 객체에 남겨도 무해합니다.
const CONSUMPTION_MILESTONES = [
  { id: "m1", amount: 1000, reward: { type: "booster", amount: 1, label: "비료 부스터 +1" } },
  { id: "m5", amount: 5000, reward: { type: "rice", amount: 1000, label: "쌀알 +1kg" } },
  { id: "m10", amount: 10000, reward: { type: "booster", amount: 2, label: "비료 부스터 +2" } },
  { id: "m20", amount: 20000, reward: { type: "milestoneAuto", amount: 0.1, label: "자동수확 영구 +10%" } },
  { id: "m50", amount: 50000, reward: { type: "clickPermanent", amount: 0.1, label: "클릭 수확 영구 +10%" } },
  { id: "m100", amount: 100000, reward: { type: "boosterDuration", amount: 10, label: "부스터 지속시간 영구 +10초" } },
  { id: "m250", amount: 250000, reward: { type: "booster", amount: 5, label: "비료 부스터 +5" } },
  { id: "m500", amount: 500000, reward: { type: "autoPermanent", amount: 0.1, label: "자동수확 영구 +10%" } },
  { id: "m1000", amount: 1000000, reward: { type: "allPermanent", amount: 0.05, label: "전체 수확 영구 +5%" } },
  { id: "m2500", amount: 2500000, reward: { type: "rice", amount: 100000, label: "쌀알 +100kg" } },
  { id: "m5000", amount: 5000000, reward: { type: "booster", amount: 10, label: "비료 부스터 +10" } },
  { id: "m10000", amount: 10000000, reward: { type: "clickPermanent", amount: 0.15, label: "클릭 수확 영구 +15%" } },
  { id: "m25000", amount: 25000000, reward: { type: "autoPermanent", amount: 0.15, label: "자동수확 영구 +15%" } },
  { id: "m50000", amount: 50000000, reward: { type: "boosterDuration", amount: 20, label: "부스터 지속시간 영구 +20초" } },
  { id: "m100000", amount: 100000000, reward: { type: "allPermanent", amount: 0.1, label: "전체 수확 영구 +10%" } },
  { id: "m250000", amount: 250000000, reward: { type: "booster", amount: 20, label: "비료 부스터 +20" } },
  { id: "m500000", amount: 500000000, reward: { type: "clickPermanent", amount: 0.2, label: "클릭 수확 영구 +20%" } },
  { id: "m1000000", amount: 1000000000, reward: { type: "autoPermanent", amount: 0.2, label: "자동수확 영구 +20%" } },
  { id: "m2500000", amount: 2500000000, reward: { type: "allPermanent", amount: 0.15, label: "전체 수확 영구 +15%" } },
  { id: "m5000000", amount: 5000000000, reward: { type: "unlockFlag", flag: "harvestCrown", label: "황금 수확 꾸미기 해금" } },
];

// 시연용 관리자 모드: 최종 제출 전 false로 변경하면 진입/지급 모두 비활성화.
const ADMIN_MODE_ENABLED = false;
const ADMIN_CONFIG = {
  clickCount: 5,
  clickWindowMs: 3000,
  maxGrantRice: 1e12, // g: 직접 지급 1회 상한(게임 최고 LV 시연도 가능한 범위)
  maxRiceBalance: Number.MAX_SAFE_INTEGER / 2,
};

// ----------------------------------------------------------------------------
// 4. 비료 부스터
// ----------------------------------------------------------------------------
const BOOSTER_CONFIG = {
  baseMultiplier: 2,
  baseDurationSeconds: 60,
  // 남은 시간 + 이번 비료 시간이 이 값을 넘으면 사용 불가 (비료가 꺼져 있을 때는 이 값까지만 적용)
  maxActiveSeconds: 30 * 60,
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
  { id: "dailyBooster", name: "비료 뿌리기", conditionText: "부스터 1회 사용", type: "boosterUse", target: 1, reward: { type: "booster", amount: 1, label: "비료 부스터 +1" } },
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
// 비료 부스터 위주로 지급해 이미 자리 잡은 다른 보상 체계와 균형을 맞춘다.
// (인기도 시스템은 폐지되어 이 보상 목록에는 등장하지 않는다.)
const ATTENDANCE_REWARDS = [
  { day: 1, type: "rice", amount: 30, label: "쌀알 +30g" },
  { day: 2, type: "rice", amount: 80, label: "쌀알 +80g" },
  { day: 3, type: "booster", amount: 1, label: "비료 부스터 +1" },
  { day: 4, type: "rice", amount: 120, label: "쌀알 +120g" },
  { day: 5, type: "rice", amount: 200, label: "쌀알 +200g" },
  { day: 6, type: "booster", amount: 2, label: "비료 부스터 +2" },
  { day: 7, type: "boosterRice", amount: 3, riceAmount: 500, label: "비료 부스터 +3, 쌀알 +500g", isFinal: true },
];

// ----------------------------------------------------------------------------
// 9-1. 랜덤 이벤트 (퀵메뉴 '이벤트') — 바로 할 수 있는 짧은 과제 1개가 무작위로 제시됨
// ----------------------------------------------------------------------------
// 흐름: 대기(시작 버튼) → 진행 중 → 달성(보상 받기) → 쿨다운 후 다음 이벤트 무작위 등장
// type: 진행도를 올리는 행동 ('click' | 'friend' | 'boosterUse' | 'recipe' | 'upgrade')
// timeLimitSeconds: 시작 후 제한 시간(초). 없으면 시간 제한 없음. 시간 초과 시 '다시 도전' 가능
// 보상: 받는 순간 보유 쌀알이 rewardMultiplier배가 됨 (최소 minRewardRice 보장)
//   단, 자동 수확 maxRewardSeconds초치(타임 버프 제외)를 넘지 않음 — 쌀알을 모아 둘수록 보상이 무한히
//   커져 몇 분마다 보유량이 1.5배씩 불어나던 문제 방지 (2026-10-01)
const EVENT_CONFIG = {
  rewardMultiplier: 1.5,
  minRewardRice: 100,
  maxRewardSeconds: 600,
  cooldownSeconds: 180, // 보상 수령 후 다음 이벤트가 나올 때까지
};

const RANDOM_EVENTS = [
  { id: "clickRush", name: "번개 수확", description: "1분 안에 올리를 20번 클릭하기", type: "click", target: 20, timeLimitSeconds: 60 },
  { id: "clickStorm", name: "폭풍 수확", description: "30초 안에 올리를 15번 클릭하기", type: "click", target: 15, timeLimitSeconds: 30 },
  { id: "makeFriend", name: "함께 짓는 농사", description: "친구 요청 보내기 또는 받은 요청 수락하기", type: "friend", target: 1 },
  { id: "useFertilizer", name: "비료 뿌리는 날", description: "비료 부스터 1번 사용하기", type: "boosterUse", target: 1 },
  { id: "cookTwice", name: "오늘은 내가 요리사", description: "레시피 2번 사용하기", type: "recipe", target: 2 },
  { id: "toolCare", name: "장비 손질", description: "수확 장비 1번 강화하기", type: "upgrade", target: 1 },
];

// ----------------------------------------------------------------------------
// 10. 홈 화면 '오늘의 문구' — 접속(페이지 로드)할 때마다 무작위 1개 (직전 접속 문구는 제외)
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

// excludeIndex(직전에 보여준 문구)를 뺀 나머지 중에서 균등하게 하나를 고른다.
function pickRandomPhraseIndex(excludeIndex = -1) {
  if (DAILY_PHRASES.length <= 1) return 0;
  const hasExclude = Number.isInteger(excludeIndex) && excludeIndex >= 0 && excludeIndex < DAILY_PHRASES.length;
  let index = Math.floor(Math.random() * (DAILY_PHRASES.length - (hasExclude ? 1 : 0)));
  if (hasExclude && index >= excludeIndex) index += 1;
  return index;
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
