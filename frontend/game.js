// balance-config.js에서 정의한 상수/설정을 사용합니다. index.html에서
// balance-config.js를 game.js보다 먼저 로드해야 합니다.

const STORAGE_KEY = "ollies-harvest-save-v2";
// 로컬 개발(정적 서버 4174 + 백엔드 8000을 따로 실행)에서는 절대 주소가 필요하고,
// 배포 환경(Nginx가 프론트/백엔드를 같은 오리진으로 리버스 프록시)에서는 상대 경로면 충분합니다.
// 자세한 배포 구성은 GCP.md 참고.
const API_BASE_URL =
  typeof location !== "undefined" && location.port === "4174" ? "http://127.0.0.1:8000" : "";
const OLLIE_HARVEST_IMAGE = "./assets/images/characters/ollie_harvest.png";

// ----------------------------------------------------------------------------
// 소비량 보상 트랙(통계 화면 전용). 게임 LV 기준/보상과 별개로 유지합니다.
// ----------------------------------------------------------------------------
const milestones = CONSUMPTION_MILESTONES;

// ----------------------------------------------------------------------------
// 초기 상태
// ----------------------------------------------------------------------------
const initialState = {
  rice: 0, // 보유 쌀알
  totalHarvested: 0, // 누적 수확량(참고용, 통계 표시)
  consumed: 0, // 누적 쌀 소비량 (totalConsumedRice) — 게임 LV 판정 기준

  level: 1, // 게임 전체 LV (1~12)
  claimedLevelRewards: {},
  unlockFlags: {},

  clickTool: { tier: 1, level: 1 },
  autoTool: { tier: 1, level: 1 },
  permanentBonus: { click: 0, auto: 0, all: 0 }, // 게임 LV 보상으로 누적되는 영구 배율
  missionTapBonus: 0, // 기존 미션 보상(클릭 수확 플랫 보너스) — 유지
  milestoneAutoBonus: 0, // 기존 소비 마일스톤 보상(자동 수확 %) — 유지

  boosterCount: 0,
  boosterMultiplierBonus: 0, // 게임 LV.11 보상으로 누적되는 부스터 배율 보너스
  boosterDurationBonusSeconds: 0, // 밥: 다음 부스터 1회에 적용 후 초기화
  permanentBoosterDurationSeconds: 0, // 소비 마일스톤의 영구 시간 보너스
  boosterMultiplierCharges: 0, // 쌀빵: +0.5배 강화 부스터 사용 가능 횟수
  activeBoosterRecipeBonus: 0, // 현재 부스터의 레시피 가산 배율(중첩하지 않음)
  boosterEndTime: 0,

  recipeUses: Object.fromEntries(RECIPES.map((recipe) => [recipe.id, 0])),
  claimedMilestones: Object.fromEntries(milestones.map((milestone) => [milestone.id, false])),

  // 오늘의 미션 (일일 리셋)
  dailyDateKey: getLocalDateKey(),
  dailyProgress: { click: 0, upgrade: 0, recipe: 0, boosterUse: 0 },
  dailyClaimed: Object.fromEntries(DAILY_MISSIONS.map((mission) => [mission.id, false])),

  // 주간 랭킹
  weekKey: getISOWeekKey(),
  weeklyHarvest: 0,

  // 출석 보상 (최대 7일, 반복 없음)
  attendance: {
    count: 0, // 인정된 출석일 수 (0~7)
    lastDateKey: "", // 마지막으로 출석이 인정된 로컬 날짜
    claimedDays: {}, // { "1": true, ... } 이미 받은 날짜별 보상
  },

  // 랜덤 이벤트 (퀵메뉴 '이벤트')
  // status: none | ready(시작 전) | active(진행 중) | complete(보상 대기) | failed(시간 초과) | claimed(쿨다운)
  event: { id: "", status: "none", progress: 0, startedAt: 0, nextAt: 0 },

  backgroundStage: 1,

  soundEnabled: true,
  festivalHeld: false, // LV.12(최종 호칭) 달성 축하 팝업을 이미 봤는지 여부
  lastSavedAt: Date.now(),
  lastLoginTime: Date.now(),

  buffs: {
    clickUntil: 0,
    clickMultiplier: 1,
    autoUntil: 0,
    autoMultiplier: 1,
    allUntil: 0,
    allMultiplier: 1,
  },
};

let hasLocalSave = false;
let state = loadState();
let selectedRecipeQty = 1; // UI 전용 상태(저장하지 않음): 1 / 10 / 100 / "MAX"
let lastTick = performance.now();
let lastFullRender = 0;
let toastTimer = 0;
let ollieReactionTimer = 0;
let audioContext;

const elements = {
  field: document.querySelector(".field"),
  rice: document.querySelector("#rice"),
  perSecond: document.querySelector("#perSecond"),
  tapValue: document.querySelector("#tapValue"),
  levelLabel: document.querySelector("#levelLabel"),
  xpBar: document.querySelector("#xpBar"),
  stageList: document.querySelector("#stageList"),
  upgradeList: document.querySelector("#upgradeList"),
  recipeCount: document.querySelector("#recipeCount"),
  recipeList: document.querySelector("#recipeList"),
  recipeQtyButtons: document.querySelector("#recipeQtyButtons"),
  missionList: document.querySelector("#missionList"),
  missionDialogList: document.querySelector("#missionDialogList"),
  attendanceList: document.querySelector("#attendanceList"),
  eventList: document.querySelector("#eventList"),
  eventSkipButton: document.querySelector("#eventSkipButton"),
  milestoneList: document.querySelector("#milestoneList"),
  statsSummary: document.querySelector("#statsSummary"),
  statsUpgradeList: document.querySelector("#statsUpgradeList"),
  rankingList: document.querySelector("#rankingList"),
  myWeeklyRank: document.querySelector("#myWeeklyRank"),
  myFriendCode: document.querySelector("#myFriendCode"),
  friendRequestForm: document.querySelector("#friendRequestForm"),
  friendCodeInput: document.querySelector("#friendCodeInput"),
  friendRequestMessage: document.querySelector("#friendRequestMessage"),
  friendRequestList: document.querySelector("#friendRequestList"),
  friendList: document.querySelector("#friendList"),
  boosterCountValue: document.querySelector("#boosterCountValue"),
  useBoosterButton: document.querySelector("#useBoosterButton"),
  dailyPhraseText: document.querySelector("#dailyPhraseText"),
  growthProgressLabel: document.querySelector("#growthProgressLabel"),
  growthNextHint: document.querySelector("#growthNextHint"),
  boosterStatusPanel: document.querySelector("#boosterStatusPanel"),
  boosterStatusHeadline: document.querySelector("#boosterStatusHeadline"),
  boosterStatusLabel1: document.querySelector("#boosterStatusLabel1"),
  boosterStatusValue1: document.querySelector("#boosterStatusValue1"),
  boosterStatusLabel2: document.querySelector("#boosterStatusLabel2"),
  boosterStatusValue2: document.querySelector("#boosterStatusValue2"),
  storageRecipeList: document.querySelector("#storageRecipeList"),
  storageLevelList: document.querySelector("#storageLevelList"),
  levelDialog: document.querySelector("#levelDialog"),
  levelDialogList: document.querySelector("#levelDialogList"),
  harvestButton: document.querySelector("#harvestButton"),
  ollieImage: document.querySelector("#ollieImage"),
  floatLayer: document.querySelector("#floatLayer"),
  saveButton: document.querySelector("#saveButton"),
  resetButton: document.querySelector("#resetButton"),
  soundButton: document.querySelector("#soundButton"),
  soundIcon: document.querySelector("#soundIcon"),
  toast: document.querySelector("#toast"),
  canvas: document.querySelector("#fieldCanvas"),
  festivalDialog: document.querySelector("#festivalDialog"),
};

const field = {
  context: elements.canvas.getContext("2d"),
  riceHeads: Array.from({ length: 28 }, () => ({
    x: Math.random(),
    y: Math.random(),
    h: Math.random() * 42 + 42,
    sway: Math.random() * Math.PI * 2,
  })),
};

// ----------------------------------------------------------------------------
// 상태 로드/저장/동기화
// ----------------------------------------------------------------------------
function cloneInitialState() {
  return JSON.parse(JSON.stringify(initialState));
}

function normalizeState(saved) {
  const merged = {
    ...cloneInitialState(),
    ...saved,
    clickTool: { ...initialState.clickTool, ...saved.clickTool },
    autoTool: { ...initialState.autoTool, ...saved.autoTool },
    permanentBonus: { ...initialState.permanentBonus, ...saved.permanentBonus },
    claimedLevelRewards: { ...initialState.claimedLevelRewards, ...saved.claimedLevelRewards },
    unlockFlags: { ...initialState.unlockFlags, ...saved.unlockFlags },
    recipeUses: { ...initialState.recipeUses, ...saved.recipeUses },
    claimedMilestones: { ...initialState.claimedMilestones, ...saved.claimedMilestones },
    dailyProgress: { ...initialState.dailyProgress, ...saved.dailyProgress },
    dailyClaimed: { ...initialState.dailyClaimed, ...saved.dailyClaimed },
    buffs: { ...initialState.buffs, ...saved.buffs },
    attendance: {
      ...initialState.attendance,
      ...saved.attendance,
      claimedDays: { ...initialState.attendance.claimedDays, ...(saved.attendance && saved.attendance.claimedDays) },
    },
    event: { ...initialState.event, ...saved.event },
  };

  // 구버전 인기도는 해금 이력으로만 이관하고 폐기합니다. 새 성장 재화는 없습니다.
  const legacyUnlocks = { meal: 0, kimbap: 10, tteok: 25, bread: 45, nurungji: 70 };
  if (Object.prototype.hasOwnProperty.call(saved, "popularity")) {
    for (const recipe of RECIPES) {
      if ((saved.popularity || 0) >= legacyUnlocks[recipe.id] || merged.recipeUses[recipe.id] > 0) {
        merged.unlockFlags[`recipe_${recipe.id}`] = true;
      }
    }
  }
  delete merged.popularity;
  // 이미 활성화된 구버전 버프도 현재 고정 배율로 정규화하되 종료 시각은 보존합니다.
  for (const recipe of RECIPES) {
    if (recipe.buff) merged.buffs[`${recipe.buff.type}Multiplier`] = recipe.buff.multiplier;
  }

  // 오늘의 미션: 저장된 날짜(로컬 기준)와 오늘이 다르면 진행도/수령 여부 리셋
  const today = getLocalDateKey();
  if (merged.dailyDateKey !== today) {
    merged.dailyDateKey = today;
    merged.dailyProgress = { click: 0, upgrade: 0, recipe: 0, boosterUse: 0 };
    merged.dailyClaimed = Object.fromEntries(DAILY_MISSIONS.map((mission) => [mission.id, false]));
  }

  // 주간 랭킹: 저장된 주차와 이번 주가 다르면 주간 수확량 리셋
  const thisWeek = getISOWeekKey();
  if (merged.weekKey !== thisWeek) {
    merged.weekKey = thisWeek;
    merged.weeklyHarvest = 0;
  }

  // 오프라인 자동수확: 마지막 접속 이후 경과 시간만큼, 최대 OFFLINE_MAX_SECONDS까지 인정.
  // 기획서 15장 공식을 그대로 사용: OfflineRice = AutoProductionPerSecond × min(경과초, 최대초)
  const elapsed = Math.max(0, (Date.now() - (saved.lastSavedAt || Date.now())) / 1000);
  const offlineSeconds = Math.min(elapsed, OFFLINE_MAX_SECONDS);
  const offlinePerSecond = getPerSecond(merged, { ignoreTimedBuffs: true });
  const offlineGain = offlinePerSecond * offlineSeconds;
  if (offlineGain >= 1) {
    merged.rice += offlineGain;
    merged.totalHarvested += offlineGain;
    setTimeout(() => showToast(`쉬는 동안 올리가 +${formatWeight(offlineGain)}을 수확했어요.`), 300);
  }
  merged.lastLoginTime = Date.now();
  return merged;
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("currentUser"));
  } catch {
    return null;
  }
}

function getStorageKey() {
  const user = getCurrentUser();
  return user ? `${STORAGE_KEY}:${user.id}` : STORAGE_KEY;
}

function loadState() {
  const raw = localStorage.getItem(getStorageKey());
  if (!raw) return cloneInitialState();
  try {
    const parsed = normalizeState(JSON.parse(raw));
    hasLocalSave = true;
    return parsed;
  } catch {
    return cloneInitialState();
  }
}

async function syncFromServer() {
  const user = getCurrentUser();
  if (!user) return;
  try {
    const res = await fetch(`${API_BASE_URL}/save?user_id=${user.id}`);
    if (!res.ok) return;
    const payload = await res.json();
    const serverState = payload.data;
    const localTimestamp = hasLocalSave ? state.lastSavedAt || 0 : 0;
    if (serverState && (serverState.lastSavedAt || 0) > localTimestamp) {
      state = normalizeState(serverState);
      stopRiceTween();
      hasLocalSave = true;
      checkGameLevelUp();
      checkMilestones();
      render();
    }
  } catch {
    // 서버 연결 실패 시 로컬 데이터로 계속 진행
  }
}

function pushToServer() {
  const user = getCurrentUser();
  if (!user) return;
  fetch(`${API_BASE_URL}/save`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: user.id, data: state }),
  }).catch(() => {});
}

async function loadLeaderboard() {
  if (!elements.rankingList) return;
  elements.rankingList.innerHTML = '<p class="screen-placeholder">불러오는 중...</p>';
  const user = getCurrentUser();
  try {
    const url = user ? `${API_BASE_URL}/leaderboard/weekly?user_id=${user.id}` : `${API_BASE_URL}/leaderboard/weekly`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("leaderboard request failed");
    const payload = await res.json();
    renderLeaderboard(payload.entries, payload.myEntry);
  } catch {
    elements.rankingList.innerHTML = '<p class="screen-placeholder">랭킹을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.</p>';
  }
}

function renderLeaderboard(entries, myEntry) {
  if (elements.myWeeklyRank) {
    elements.myWeeklyRank.textContent = myEntry
      ? `내 순위 ${myEntry.rank}위 · 주간 수확량 ${formatWeight(myEntry.weeklyHarvest)}`
      : "";
  }

  if (!entries || entries.length === 0) {
    elements.rankingList.innerHTML = '<p class="screen-placeholder">아직 랭킹에 오른 플레이어가 없습니다.</p>';
    return;
  }
  const currentUser = getCurrentUser();
  elements.rankingList.innerHTML = "";
  for (const entry of entries) {
    const div = document.createElement("div");
    const isMe = currentUser && entry.nickname === currentUser.nickname;
    div.className = `game-card${isMe ? " claimed" : ""}`;
    div.innerHTML = `
      <span class="card-icon">${entry.rank <= 3 ? "🏆" : entry.rank}</span>
      <span>
        <span class="card-title">${entry.nickname}${isMe ? " (나)" : ""}</span>
        <span class="card-meta">주간 누적 수확량</span>
      </span>
      <span class="card-cost">${formatWeight(entry.weeklyHarvest)}</span>
    `;
    elements.rankingList.append(div);
  }
}

function loadFriendsScreen() {
  if (elements.myFriendCode) {
    const user = getCurrentUser();
    elements.myFriendCode.textContent = user?.friend_code || "-";
  }
  loadFriendRequests();
  loadFriends();
}

async function loadFriendRequests() {
  const user = getCurrentUser();
  if (!user || !elements.friendRequestList) return;
  try {
    const res = await fetch(`${API_BASE_URL}/friends/requests?user_id=${user.id}`);
    if (!res.ok) throw new Error("friend requests fetch failed");
    const payload = await res.json();
    renderFriendRequests(payload.requests);
  } catch {
    elements.friendRequestList.innerHTML = '<p class="screen-placeholder">받은 요청을 불러올 수 없습니다.</p>';
  }
}

function renderFriendRequests(requests) {
  if (!requests || requests.length === 0) {
    elements.friendRequestList.innerHTML = '<p class="screen-placeholder">받은 친구 요청이 없습니다.</p>';
    return;
  }
  elements.friendRequestList.innerHTML = "";
  for (const request of requests) {
    const div = document.createElement("div");
    div.className = "game-card";
    div.innerHTML = `
      <span class="card-icon">👤</span>
      <span>
        <span class="card-title">${request.requester_nickname}</span>
        <span class="card-meta">친구 요청을 보냈어요</span>
      </span>
      <span class="friend-request-actions">
        <button type="button" class="friend-accept-btn">수락</button>
        <button type="button" class="friend-decline-btn">거절</button>
      </span>
    `;
    div.querySelector(".friend-accept-btn").addEventListener("click", () => respondToFriendRequest(request.request_id, true));
    div.querySelector(".friend-decline-btn").addEventListener("click", () => respondToFriendRequest(request.request_id, false));
    elements.friendRequestList.append(div);
  }
}

async function respondToFriendRequest(requestId, accept) {
  const user = getCurrentUser();
  if (!user) return;
  try {
    const res = await fetch(`${API_BASE_URL}/friends/${accept ? "accept" : "decline"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id, request_id: requestId }),
    });
    const payload = await res.json();
    showToast(res.ok ? payload.message : payload.detail || "요청 처리에 실패했습니다.");
    if (res.ok && accept) {
      advanceEvent("friend");
      render();
      saveState(true);
    }
    loadFriendsScreen();
  } catch {
    showToast("서버에 연결할 수 없습니다.");
  }
}

async function loadFriends() {
  const user = getCurrentUser();
  if (!user || !elements.friendList) return;
  try {
    const res = await fetch(`${API_BASE_URL}/friends?user_id=${user.id}`);
    if (!res.ok) throw new Error("friends fetch failed");
    const payload = await res.json();
    renderFriends(payload.friends);
  } catch {
    elements.friendList.innerHTML = '<p class="screen-placeholder">친구 목록을 불러올 수 없습니다.</p>';
  }
}

function renderFriends(friends) {
  if (!friends || friends.length === 0) {
    elements.friendList.innerHTML = '<p class="screen-placeholder">아직 친구가 없습니다. 친구 코드로 친구를 추가해보세요.</p>';
    return;
  }
  elements.friendList.innerHTML = "";
  friends.forEach((friend, index) => {
    const div = document.createElement("div");
    div.className = "game-card";
    div.innerHTML = `
      <span class="card-icon">${index + 1}</span>
      <span>
        <span class="card-title">${friend.nickname}</span>
        <span class="card-meta">LV.${friend.gameLevel} ${friend.gameLevelTitle} · 주간 수확량 ${formatWeight(friend.weeklyHarvest)}</span>
      </span>
      <span class="card-cost">${formatWeight(friend.weeklyHarvest)}</span>
    `;
    elements.friendList.append(div);
  });
}

if (elements.friendRequestForm) {
  elements.friendRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = getCurrentUser();
    const code = elements.friendCodeInput.value.trim();
    if (!user || !code) return;
    try {
      const res = await fetch(`${API_BASE_URL}/friends/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester_id: user.id, target_friend_code: code }),
      });
      const payload = await res.json();
      elements.friendRequestMessage.textContent = res.ok ? payload.message : payload.detail || "친구 요청에 실패했습니다.";
      if (res.ok) {
        elements.friendCodeInput.value = "";
        advanceEvent("friend");
        render();
        saveState(true);
        loadFriendsScreen();
      }
    } catch {
      elements.friendRequestMessage.textContent = "서버에 연결할 수 없습니다.";
    }
  });
}

function saveState(silent = false) {
  state.lastSavedAt = Date.now();
  localStorage.setItem(getStorageKey(), JSON.stringify(state));
  pushToServer();
  if (!silent) showToast("저장 완료");
}

// ----------------------------------------------------------------------------
// 장비(수동/자동) 계산 — balance-config.js의 TOOL_CONFIG / tierBasePower 사용
// ----------------------------------------------------------------------------
function getToolPower(tool, config) {
  const base = tierBasePower(tool.tier);
  return base * (1 + config.innerLevelGrowth * (tool.level - 1));
}

function getInnerUpgradeCost(tool, config) {
  const baseCost = config.costMultiplierPerTier * tierBasePower(tool.tier);
  return Math.floor(baseCost * config.costGrowthPerLevel ** (tool.level - 1));
}

function getNextTierCost(tool, config) {
  const nextTier = tool.tier + 1;
  if (nextTier > config.tierCount) return null;
  return Math.floor(config.costMultiplierPerTier * tierBasePower(nextTier));
}

function isNextTierUnlocked(tool, config) {
  const nextTier = tool.tier + 1;
  return nextTier <= config.tierCount && state.level >= nextTier;
}

function buyInnerUpgrade(kind) {
  const tool = kind === "click" ? state.clickTool : state.autoTool;
  const config = kind === "click" ? TOOL_CONFIG.click : TOOL_CONFIG.auto;
  const cost = getInnerUpgradeCost(tool, config);
  if (!spendRice(cost)) return;
  tool.level += 1;
  showOllieReaction("./assets/images/characters/ollie_upgrade.png", 1000);
  showActionEffect("./assets/images/effects/fx_sparkle.png", undefined, undefined, "effect-small");
  playGameSound("upgrade");
  const label = kind === "click" ? "수동 수확 장비" : "자동 수확 설비";
  showToast(`${label} 강화 완료 (Lv.${tool.level})`);
  state.dailyProgress.upgrade = (state.dailyProgress.upgrade || 0) + 1;
  advanceEvent("upgrade");
  render();
  saveState(true);
}

function buyNextTier(kind) {
  const tool = kind === "click" ? state.clickTool : state.autoTool;
  const config = kind === "click" ? TOOL_CONFIG.click : TOOL_CONFIG.auto;
  if (!isNextTierUnlocked(tool, config)) return;
  const cost = getNextTierCost(tool, config);
  if (cost == null || !spendRice(cost)) return;
  tool.tier += 1;
  tool.level = 1;
  const names = kind === "click" ? TOOL_TIER_NAMES.click : TOOL_TIER_NAMES.auto;
  showOllieReaction("./assets/images/characters/ollie_upgrade.png", 1200);
  showActionEffect("./assets/images/effects/fx_level_up.png", undefined, undefined, "effect-level");
  playGameSound("level");
  showToast(`${names[tool.tier - 1]}(으)로 장비를 교체했어요!`);
  state.dailyProgress.upgrade = (state.dailyProgress.upgrade || 0) + 1;
  advanceEvent("upgrade");
  render();
  saveState(true);
}

// ----------------------------------------------------------------------------
// 생산량 계산 (클릭 / 초당) — 영구 보너스 + 타임 버프 + 부스터 반영
// ----------------------------------------------------------------------------
function getBoosterMultiplier(targetState = state) {
  if (Date.now() >= (targetState.boosterEndTime || 0)) return 1;
  return getBaseBoosterMultiplier(targetState) + (targetState.activeBoosterRecipeBonus || 0);
}

function getTapPower(targetState = state) {
  let power = getToolPower(targetState.clickTool, TOOL_CONFIG.click) + (targetState.missionTapBonus || 0);
  power *= 1 + (targetState.permanentBonus.click || 0);
  power *= 1 + (targetState.permanentBonus.all || 0);
  if (Date.now() < targetState.buffs.clickUntil) power *= targetState.buffs.clickMultiplier || 1;
  if (Date.now() < targetState.buffs.allUntil) power *= targetState.buffs.allMultiplier || 1;
  power *= getBoosterMultiplier(targetState);
  return power;
}

function getPerSecond(targetState = state, options = {}) {
  let power = getToolPower(targetState.autoTool, TOOL_CONFIG.auto);
  power *= 1 + (targetState.permanentBonus.auto || 0);
  power *= 1 + (targetState.permanentBonus.all || 0);
  power *= 1 + (targetState.milestoneAutoBonus || 0);

  if (!options.ignoreTimedBuffs) {
    if (Date.now() < targetState.buffs.autoUntil) power *= targetState.buffs.autoMultiplier || 1;
    if (Date.now() < targetState.buffs.allUntil) power *= targetState.buffs.allMultiplier || 1;
    power *= getBoosterMultiplier(targetState);
  }
  return power;
}

function isRecipeUnlocked(recipe, targetState = state) {
  return targetState.consumed >= recipe.unlockConsumed || Boolean(targetState.unlockFlags[`recipe_${recipe.id}`]);
}

function getUnlockedRecipeCount() {
  return RECIPES.filter((recipe) => isRecipeUnlocked(recipe)).length;
}

// ----------------------------------------------------------------------------
// 보유 쌀알 표시 애니메이션 — 한 번에 늘어난 양(클릭·보상)을 숫자가 흐르듯 올라가게 표시
// ----------------------------------------------------------------------------
// 실제 값(state.rice)은 즉시 바뀌고, 화면에는 "아직 다 올라가지 않은 양"(offset)을 뺀 값을 보여준다.
// offset은 RICE_TWEEN_MS 동안 감속하며(easeOutCubic) 0이 된다. 연속으로 늘어나면 남은 양에 더해 다시 시작.
// 자동 수확처럼 매 프레임 조금씩 늘어나는 양은 애니메이션 없이 바로 반영해 표시가 뒤처지지 않게 한다.
const RICE_TWEEN_MS = 600;
// 한 번 읽을 때 진행시키는 최대 시간. 클릭 처리 등으로 화면이 잠깐 멈춰도(프레임 드랍)
// 애니메이션 앞부분을 건너뛰지 않고 이어서 흐르게 한다.
const RICE_TWEEN_MAX_STEP_MS = 34;
const riceTween = { startOffset: 0, elapsed: 0, lastReadAt: 0 };

function getRiceTweenOffset(now = performance.now()) {
  if (riceTween.startOffset <= 0) return 0;
  riceTween.elapsed += Math.min(Math.max(0, now - riceTween.lastReadAt), RICE_TWEEN_MAX_STEP_MS);
  riceTween.lastReadAt = now;
  const progress = Math.min(1, riceTween.elapsed / RICE_TWEEN_MS);
  if (progress >= 1) {
    riceTween.startOffset = 0;
    return 0;
  }
  return riceTween.startOffset * (1 - progress) ** 3; // easeOutCubic의 남은 양
}

function startRiceTween(amount) {
  if (!(amount > 0)) return;
  const now = performance.now();
  riceTween.startOffset = getRiceTweenOffset(now) + amount;
  riceTween.elapsed = 0;
  riceTween.lastReadAt = now;
}

function stopRiceTween() {
  riceTween.startOffset = 0;
}

function getDisplayedRice() {
  return Math.max(0, state.rice - getRiceTweenOffset());
}

// options.instant: 애니메이션 없이 바로 표시 (자동 수확 등 매 프레임 증가분)
function gainRice(amount, options = {}) {
  if (!options.instant) startRiceTween(amount);
  state.rice += amount;
  state.totalHarvested += amount;
  state.weeklyHarvest += amount;
}

function spendRice(amount) {
  if (amount <= 0 || state.rice < amount) return false;
  state.rice -= amount;
  stopRiceTween(); // 쓴 만큼은 바로 줄어든 값으로 표시
  return true;
}

// ----------------------------------------------------------------------------
// 숫자/무게 표기 — 트릴리언 단위까지 대응
// ----------------------------------------------------------------------------
const WEIGHT_UNITS = [
  { limit: 1e6, suffix: "kg", divisor: 1e3 },
  { limit: 1e9, suffix: "t", divisor: 1e6 },
  { limit: 1e12, suffix: "kt", divisor: 1e9 },
  { limit: 1e15, suffix: "Mt", divisor: 1e12 },
  { limit: 1e18, suffix: "Gt", divisor: 1e15 },
  { limit: Infinity, suffix: "Tt", divisor: 1e18 },
];

// 보유 쌀알처럼 계속 바뀌는 숫자용: kg 이상은 항상 소수점 두 자리(끝자리 0 유지)로 표시해
// 글자 수가 바뀌지 않게 한다. 반올림 대신 내림을 써서 실제 보유량보다 크게 보이지 않게 한다.
function formatRiceAmount(value) {
  if (!Number.isFinite(value) || value < 1000) return formatWeight(value);
  for (const unit of WEIGHT_UNITS) {
    if (value < unit.limit) {
      const hundredths = Math.floor((value / unit.divisor) * 100 + 1e-6);
      return `${(hundredths / 100).toFixed(2)}${unit.suffix}`;
    }
  }
  return formatWeight(value);
}

function formatWeight(value) {
  if (!Number.isFinite(value)) return "0g";
  if (value < 1000) return `${Math.floor(value)}g`;
  for (const unit of WEIGHT_UNITS) {
    if (value < unit.limit) {
      const scaled = value / unit.divisor;
      const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
      const trimmed = scaled
        .toFixed(decimals)
        .replace(/(\.\d*?)0+$/, "$1")
        .replace(/\.$/, "");
      return `${trimmed}${unit.suffix}`;
    }
  }
  return `${value}g`;
}

// ----------------------------------------------------------------------------
// 게임 LV (누적 소비량 기반)
// ----------------------------------------------------------------------------
function checkGameLevelUp() {
  const target = getGameLevelByConsumed(state.consumed);
  while (state.level < target.level) {
    state.level += 1;
    claimLevelReward(state.level);
  }
}

function claimLevelReward(level) {
  if (state.claimedLevelRewards[level]) return;
  state.claimedLevelRewards[level] = true;
  const info = getGameLevelInfo(level);
  const reward = info.reward;

  switch (reward.type) {
    case "booster":
      state.boosterCount += reward.amount;
      break;
    case "clickPermanent":
      state.permanentBonus.click += reward.amount;
      break;
    case "autoPermanent":
      state.permanentBonus.auto += reward.amount;
      break;
    case "allPermanent":
      state.permanentBonus.all += reward.amount;
      break;
    case "boosterMultiplierBonus":
      state.boosterMultiplierBonus += reward.amount;
      break;
    case "unlockFlag":
      state.unlockFlags[reward.flag] = true;
      break;
    default:
      break;
  }

  showToast(`게임 LV.${level} 달성! "${info.title}"`);
  showOllieReaction("./assets/images/characters/ollie_happy.png", 1400);
  showActionEffect("./assets/images/effects/fx_level_up.png", undefined, undefined, "effect-level");
  playGameSound("level");

  if (level === MAX_GAME_LEVEL && !state.festivalHeld) {
    state.festivalHeld = true;
    setTimeout(() => {
      playGameSound("festival");
      if (elements.festivalDialog.showModal) elements.festivalDialog.showModal();
    }, 400);
  }
}

// ----------------------------------------------------------------------------
// 비료 부스터
// ----------------------------------------------------------------------------
function getBaseBoosterMultiplier(targetState = state) {
  return BOOSTER_CONFIG.baseMultiplier * (1 + (targetState.boosterMultiplierBonus || 0));
}

function getNextBoosterRecipeBonus(targetState = state) {
  return targetState.boosterMultiplierCharges > 0
    ? RECIPES.find((recipe) => recipe.boosterMultiplierBonus)?.boosterMultiplierBonus || 0
    : 0;
}

function getNextBoosterDuration(targetState = state) {
  return BOOSTER_CONFIG.baseDurationSeconds + (targetState.permanentBoosterDurationSeconds || 0)
    + (targetState.boosterDurationBonusSeconds || 0);
}

function useBooster() {
  if (state.boosterCount <= 0) return;
  state.boosterCount -= 1;
  const duration = getNextBoosterDuration();
  const now = Date.now();
  const currentEnd = Math.max(state.boosterEndTime || 0, now);
  const recipeBonus = getNextBoosterRecipeBonus();
  const activeBonus = state.boosterEndTime > now ? state.activeBoosterRecipeBonus || 0 : 0;
  state.activeBoosterRecipeBonus = Math.max(activeBonus, recipeBonus);
  if (state.boosterMultiplierCharges > 0) state.boosterMultiplierCharges -= 1;
  state.boosterDurationBonusSeconds = 0;
  state.boosterEndTime = Math.min(MAX_EFFECT_TIMESTAMP, currentEnd + duration * 1000);
  showOllieReaction("./assets/images/characters/ollie_happy.png", 1000);
  showActionEffect("./assets/images/effects/fx_sparkle.png", undefined, undefined, "effect-small");
  playGameSound("upgrade");
  showToast(`비료 부스터 사용! 전체 수확량 ${getBoosterMultiplier().toFixed(1)}배`);
  state.dailyProgress.boosterUse = (state.dailyProgress.boosterUse || 0) + 1;
  advanceEvent("boosterUse");
  render();
  saveState(true);
}

// ----------------------------------------------------------------------------
// 레시피 (수량 선택 1 / 10 / 100 / MAX)
// ----------------------------------------------------------------------------
function getRecipeQty(recipe) {
  if (selectedRecipeQty === "MAX") {
    if (recipe.cost <= 0) return 0;
    return Math.max(0, Math.floor(state.rice / recipe.cost));
  }
  return selectedRecipeQty;
}

function setRecipeQty(qty) {
  selectedRecipeQty = qty;
  renderRecipes();
}

function useRecipe(recipe) {
  if (!isRecipeUnlocked(recipe)) return;
  const qty = getRecipeQty(recipe);
  if (qty <= 0) return;

  const totalCost = recipe.cost * qty;
  if (!spendRice(totalCost)) return;

  const unlockedBefore = getUnlockedRecipeCount();
  state.consumed += totalCost;
  state.recipeUses[recipe.id] += qty;

  if (recipe.buff) {
    const { type, duration, multiplier } = recipe.buff;
    const untilKey = `${type}Until`;
    state.buffs[untilKey] = Math.min(MAX_EFFECT_TIMESTAMP,
      Math.max(Date.now(), state.buffs[untilKey] || 0) + duration * qty * 1000);
    state.buffs[`${type}Multiplier`] = multiplier;
  }
  if (recipe.boosterDurationBonusSeconds) {
    state.boosterDurationBonusSeconds = Math.min(MAX_PENDING_SECONDS,
      state.boosterDurationBonusSeconds + recipe.boosterDurationBonusSeconds * qty);
  }
  if (recipe.boosterMultiplierBonus) {
    state.boosterMultiplierCharges = Math.min(Number.MAX_SAFE_INTEGER, state.boosterMultiplierCharges + qty);
  }

  showOllieReaction("./assets/images/characters/ollie_happy.png", 1000);
  showActionEffect("./assets/images/effects/fx_consume_complete.png");
  playGameSound("recipe");
  if (getUnlockedRecipeCount() > unlockedBefore) {
    showActionEffect("./assets/images/effects/fx_recipe_unlock.png", undefined, undefined, "effect-unlock");
  }
  showToast(qty > 1 ? `${recipe.name} ×${qty} — ${recipe.message}` : recipe.message);
  state.dailyProgress.recipe = (state.dailyProgress.recipe || 0) + 1; // "레시피 N회 사용" = 사용 액션 횟수 기준(수량 아님)
  advanceEvent("recipe");

  checkGameLevelUp();
  checkMilestones();
  render();
  saveState(true);
}

function checkDailyAndWeeklyReset() {
  const today = getLocalDateKey();
  if (state.dailyDateKey !== today) {
    state.dailyDateKey = today;
    state.dailyProgress = { click: 0, upgrade: 0, recipe: 0, boosterUse: 0 };
    state.dailyClaimed = Object.fromEntries(DAILY_MISSIONS.map((mission) => [mission.id, false]));
  }
  const thisWeek = getISOWeekKey();
  if (state.weekKey !== thisWeek) {
    state.weekKey = thisWeek;
    state.weeklyHarvest = 0;
  }
  checkAttendanceProgress(today);
}

// ----------------------------------------------------------------------------
// 출석 보상 (최대 7일, 반복 없음)
// ----------------------------------------------------------------------------
function checkAttendanceProgress(today = getLocalDateKey()) {
  if (state.attendance.count >= ATTENDANCE_REWARDS.length) return; // 7일 출석판은 완료 후 반복되지 않음
  if (state.attendance.lastDateKey === today) return; // 같은 날 중복 인정 방지 (연속 접속을 요구하지는 않음)
  state.attendance.lastDateKey = today;
  state.attendance.count += 1;
  showToast(`오늘 접속 확인! 출석 ${state.attendance.count}/${ATTENDANCE_REWARDS.length}일차`);
}

function claimAttendanceReward(day) {
  const reward = ATTENDANCE_REWARDS.find((entry) => entry.day === day);
  if (!reward) return;
  if (state.attendance.claimedDays[day]) return;
  if (state.attendance.count < day) return;
  state.attendance.claimedDays[day] = true;

  switch (reward.type) {
    case "rice":
      gainRice(reward.amount);
      break;
    case "booster":
      state.boosterCount += reward.amount;
      break;
    case "boosterRice":
      state.boosterCount += reward.amount;
      gainRice(reward.riceAmount || 0);
      break;
    default:
      break;
  }

  showActionEffect("./assets/images/effects/fx_sparkle.png", undefined, undefined, "effect-small");
  playGameSound(reward.isFinal ? "festival" : "upgrade");
  showToast(`${day}일차 출석 보상: ${reward.label}`);
  render();
  saveState(true);
}

// ----------------------------------------------------------------------------
// 랜덤 이벤트 (퀵메뉴 '이벤트') — balance-config.js의 RANDOM_EVENTS / EVENT_CONFIG
// ----------------------------------------------------------------------------
function getEventDef(id) {
  return RANDOM_EVENTS.find((entry) => entry.id === id) || null;
}

function pickRandomEvent(excludeId = "") {
  const pool = RANDOM_EVENTS.filter((entry) => entry.id !== excludeId);
  const def = pool[Math.floor(Math.random() * pool.length)];
  state.event = { id: def.id, status: "ready", progress: 0, startedAt: 0, nextAt: 0 };
}

function isEventTimedOut(def, now = Date.now()) {
  return Boolean(def.timeLimitSeconds) && now - state.event.startedAt > def.timeLimitSeconds * 1000;
}

// 게임 루프에서 주기적으로 호출: 첫 이벤트 배정, 시간 초과 판정, 쿨다운이 끝나면 새 이벤트
function checkEventState(now = Date.now()) {
  const ev = state.event;
  const def = getEventDef(ev.id);
  if (!def || ev.status === "none") {
    pickRandomEvent();
  } else if (ev.status === "claimed" && now >= ev.nextAt) {
    pickRandomEvent(ev.id);
  } else if (ev.status === "active" && isEventTimedOut(def, now)) {
    ev.status = "failed";
  }
}

// 받는 순간 보유 쌀알이 rewardMultiplier배가 되도록 차액을 지급 (최소 minRewardRice)
function getEventReward(targetState = state) {
  const bonus = Math.floor(targetState.rice * (EVENT_CONFIG.rewardMultiplier - 1));
  return Math.max(EVENT_CONFIG.minRewardRice, bonus);
}

function startEvent() {
  const ev = state.event;
  const def = getEventDef(ev.id);
  if (!def || (ev.status !== "ready" && ev.status !== "failed")) return;
  ev.status = "active";
  ev.progress = 0;
  ev.startedAt = Date.now();
  showToast(`이벤트 시작! ${def.description}`);
  render();
  saveState(true);
}

function advanceEvent(type, amount = 1) {
  const ev = state.event;
  const def = getEventDef(ev.id);
  if (!def || ev.status !== "active" || def.type !== type) return;
  if (isEventTimedOut(def)) {
    ev.status = "failed";
    return;
  }
  ev.progress = Math.min(def.target, ev.progress + amount);
  if (ev.progress >= def.target) {
    ev.status = "complete";
    showToast(`이벤트 "${def.name}" 달성! 이벤트 창에서 보상을 받으세요.`);
  }
}

function claimEventReward() {
  const ev = state.event;
  if (ev.status !== "complete") return;
  const reward = getEventReward();
  gainRice(reward);
  ev.status = "claimed";
  ev.nextAt = Date.now() + EVENT_CONFIG.cooldownSeconds * 1000;
  showOllieReaction("./assets/images/characters/ollie_happy.png", 1200);
  showActionEffect("./assets/images/effects/fx_sparkle.png", undefined, undefined, "effect-small");
  playGameSound("festival");
  showToast(`이벤트 보상: 쌀알 +${formatWeight(reward)}`);
  render();
  saveState(true);
}

function skipEvent() {
  const ev = state.event;
  if (ev.status !== "ready" && ev.status !== "failed") return;
  pickRandomEvent(ev.id);
  render();
  saveState(true);
}

// 카드 전체가 버튼: 상태에 따라 시작 / 다시 도전 / 보상 받기
function handleEventCardClick() {
  if (state.event.status === "complete") claimEventReward();
  else startEvent();
}

function getEventView() {
  const ev = state.event;
  const def = getEventDef(ev.id);
  const rewardText = `보상: 보유 쌀알 ×${EVENT_CONFIG.rewardMultiplier}`;
  const card = (icon, title, meta, note, cost, disabled, extraClass = "") => ({
    className: `game-card event-card${extraClass}`,
    disabled,
    html: `
      <span class="card-icon">${icon}</span>
      <span>
        <span class="card-title">${title}</span>
        <span class="card-meta">${meta}</span>
        <span class="card-note">${note}</span>
      </span>
      <span class="card-cost">${cost}</span>
    `,
  });

  if (!def) return card("⏳", "이벤트 준비 중", "잠시 후 새 이벤트가 열려요", "", "대기", true);
  switch (ev.status) {
    case "active": {
      const timeLeft = def.timeLimitSeconds
        ? ` · 남은 시간 ${formatDuration(def.timeLimitSeconds - (Date.now() - ev.startedAt) / 1000)}`
        : "";
      return card("🔥", def.name, `${def.description} (${ev.progress}/${def.target})${timeLeft}`, rewardText, "진행 중", true, " is-active");
    }
    case "complete":
      return card("🎁", `${def.name} 달성!`, "눌러서 보상을 받으세요", `보유 쌀알 ×${EVENT_CONFIG.rewardMultiplier} · +${formatWeight(getEventReward())}`, "받기", false, " is-complete");
    case "failed":
      return card("⌛", def.name, `시간 초과 (${ev.progress}/${def.target}) — 눌러서 다시 도전`, rewardText, "다시 도전", false);
    case "claimed":
      return card("✔", "이벤트 완료", `${formatDuration((ev.nextAt - Date.now()) / 1000)} 후 새 이벤트가 열려요`, "", "대기", true, " claimed");
    default:
      return card("🎯", def.name, def.description, rewardText, "시작", false);
  }
}

function renderEvent() {
  if (elements.eventList) {
    renderStableButtonList(elements.eventList, [state.event], getEventView, handleEventCardClick);
  }
  const status = state.event.status;
  if (elements.eventSkipButton) elements.eventSkipButton.hidden = status !== "ready" && status !== "failed";
  const quickBtn = document.querySelector('.quick-menu-btn[data-quick="event"]');
  if (quickBtn) quickBtn.classList.toggle("has-badge", status === "ready" || status === "complete");
}

function claimDailyMission(mission) {
  if (state.dailyClaimed[mission.id]) return;
  if ((state.dailyProgress[mission.type] || 0) < mission.target) return;
  state.dailyClaimed[mission.id] = true;

  const reward = mission.reward;
  if (reward.type === "booster") state.boosterCount += reward.amount;

  showActionEffect("./assets/images/effects/fx_sparkle.png", undefined, undefined, "effect-small");
  playGameSound("upgrade");
  showToast(`${mission.name} 완료: ${reward.label}`);
  render();
  saveState(true);
}

function checkMilestones() {
  for (const milestone of milestones) {
    if (!state.claimedMilestones[milestone.id] && state.consumed >= milestone.amount) {
      state.claimedMilestones[milestone.id] = true;
      applyMilestoneReward(milestone.reward);
      showToast(`${formatMilestoneWeight(milestone.amount)} 소비 달성! ${milestone.reward.label}`);
    }
  }
}

function applyMilestoneReward(reward) {
  switch (reward.type) {
    case "booster": state.boosterCount += reward.amount; break;
    case "rice": gainRice(reward.amount); break;
    case "milestoneAuto": state.milestoneAutoBonus += reward.amount; break;
    case "clickPermanent": state.permanentBonus.click += reward.amount; break;
    case "autoPermanent": state.permanentBonus.auto += reward.amount; break;
    case "allPermanent": state.permanentBonus.all += reward.amount; break;
    case "boosterDuration": state.permanentBoosterDurationSeconds += reward.amount; break;
    case "unlockFlag": state.unlockFlags[reward.flag] = true; break;
  }
}

// ----------------------------------------------------------------------------
// 이펙트 / 사운드 유틸 (기존과 동일)
// ----------------------------------------------------------------------------
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

function showFloat(amount, x, y) {
  showActionEffect("./assets/images/effects/fx_click_ring.png", x, y, "effect-click");
  showActionEffect("./assets/images/effects/fx_sparkle.png", x - 54, y - 48, "effect-small");

  const text = document.createElement("span");
  text.className = "float-text";
  text.textContent = `+${formatWeight(amount)}`;
  text.style.left = `${x - 44}px`;
  text.style.top = `${y - 118}px`;
  elements.floatLayer.append(text);
  setTimeout(() => text.remove(), 920);

  for (let index = 0; index < 5; index += 1) {
    const grain = document.createElement("img");
    const angle = -168 + index * 42 + Math.random() * 18;
    const distance = 88 + Math.random() * 62;
    grain.className = "rice-particle";
    grain.src = "./assets/images/crops/rice_grain.png";
    grain.alt = "";
    grain.style.left = `${x - 17 + (Math.random() * 56 - 28)}px`;
    grain.style.top = `${y - 42 + (Math.random() * 44 - 22)}px`;
    grain.style.setProperty("--burst-x", `${Math.cos((angle * Math.PI) / 180) * distance}px`);
    grain.style.setProperty("--burst-y", `${Math.sin((angle * Math.PI) / 180) * distance - 22}px`);
    grain.style.setProperty("--burst-r", `${Math.round(Math.random() * 160 - 80)}deg`);
    elements.floatLayer.append(grain);
    setTimeout(() => grain.remove(), 1120);
  }
}

function playGameSound(type = "click") {
  if (!state.soundEnabled) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  audioContext ||= new AudioContextClass();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const frequencies = { click: 520, upgrade: 660, recipe: 780, level: 920, festival: 1040 };
  const duration = type === "festival" ? 0.28 : 0.12;
  const now = audioContext.currentTime;

  oscillator.type = type === "click" ? "sine" : "triangle";
  oscillator.frequency.setValueAtTime(frequencies[type] || frequencies.click, now);
  gain.gain.setValueAtTime(0.045, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function showOllieReaction(src, duration = 900) {
  clearTimeout(ollieReactionTimer);
  elements.ollieImage.src = src;
  ollieReactionTimer = setTimeout(() => {
    elements.ollieImage.src = OLLIE_HARVEST_IMAGE;
  }, duration);
}

function showActionEffect(src, x, y, className = "") {
  const effect = document.createElement("img");
  effect.className = `action-effect ${className}`.trim();
  effect.src = src;
  effect.alt = "";
  if (Number.isFinite(x)) effect.style.left = `${x}px`;
  if (Number.isFinite(y)) effect.style.top = `${y}px`;
  elements.floatLayer.append(effect);
  setTimeout(() => effect.remove(), 920);
}

function resetGame() {
  state = cloneInitialState();
  stopRiceTween();
  selectedRecipeQty = 1;
  elements.ollieImage.src = OLLIE_HARVEST_IMAGE;
  localStorage.setItem(getStorageKey(), JSON.stringify(state));
  render();
  showToast("올리의 농장을 새로 시작했어요.");
}

function resizeCanvas() {
  const rect = elements.canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  elements.canvas.width = Math.floor(rect.width * ratio);
  elements.canvas.height = Math.floor(rect.height * ratio);
  field.context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawField(now) {
  const rect = elements.canvas.getBoundingClientRect();
  const ctx = field.context;
  ctx.clearRect(0, 0, rect.width, rect.height);

  for (const rice of field.riceHeads) {
    const baseX = rice.x * rect.width;
    const baseY = rect.height * (0.58 + rice.y * 0.4);
    const sway = Math.sin(now * 0.0018 + rice.sway) * 7;
    ctx.strokeStyle = "#5d8f24";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.quadraticCurveTo(baseX + sway * 0.3, baseY - rice.h * 0.5, baseX + sway, baseY - rice.h);
    ctx.stroke();
    ctx.fillStyle = "#f5c842";
    ctx.beginPath();
    ctx.ellipse(baseX + sway + 4, baseY - rice.h, 5, 11, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ----------------------------------------------------------------------------
// 렌더링
// ----------------------------------------------------------------------------
function renderStats() {
  elements.rice.textContent = formatRiceAmount(getDisplayedRice());
  elements.perSecond.textContent = `${formatWeight(getPerSecond())}/s`;
  elements.tapValue.textContent = `+${formatWeight(getTapPower())}`;

  const levelInfo = getGameLevelInfo(state.level);
  // 줄바꿈 앞 공백: 모바일에서 <br>을 숨겨 "LV.3 성실한 농부" 한 줄로 보여줄 때 사용
  elements.levelLabel.innerHTML = `LV.${state.level} <br />${levelInfo.title}`;
  const nextLevel = getNextGameLevel(state.level);
  if (nextLevel) {
    const span = nextLevel.requiredConsumed - levelInfo.requiredConsumed;
    const progress = span > 0 ? ((state.consumed - levelInfo.requiredConsumed) / span) * 100 : 100;
    elements.xpBar.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
  } else {
    elements.xpBar.style.width = "100%";
  }

  const activeStage = [...BACKGROUND_STAGES].reverse().find((stage) => state.consumed >= stage.threshold) || BACKGROUND_STAGES[0];
  state.backgroundStage = activeStage.stage;
  elements.field.dataset.scene = activeStage.scene;
  elements.harvestButton.classList.toggle("harvest-crown", Boolean(state.unlockFlags.harvestCrown));

  elements.soundIcon.src = state.soundEnabled
    ? "./assets/images/ui/ui_sound_on.png"
    : "./assets/images/ui/ui_sound_off.png";
  elements.soundButton.setAttribute("aria-pressed", `${state.soundEnabled}`);
  elements.soundButton.title = state.soundEnabled ? "효과음 켜짐" : "효과음 꺼짐";

  if (elements.boosterCountValue) elements.boosterCountValue.textContent = `x${state.boosterCount}`;
  if (elements.useBoosterButton) {
    elements.useBoosterButton.disabled = state.boosterCount <= 0;
  }
  renderBoosterStatusPanel();
  renderDailyPhrase();
  renderGrowthCard();
}

// 오늘의 문구: 접속할 때마다 무작위로 정하고, 접속해 있는 동안은 고정한다.
// 직전 접속 문구를 기억해 두었다가 같은 문구가 연달아 나오지 않게 한다.
const LAST_PHRASE_KEY = "ollies-harvest-last-phrase";
const sessionPhrase = (() => {
  let lastIndex = -1;
  try {
    const saved = localStorage.getItem(LAST_PHRASE_KEY);
    if (saved !== null) lastIndex = Number(saved);
  } catch {
    // 저장소를 쓸 수 없으면 제외 없이 무작위
  }
  const index = pickRandomPhraseIndex(lastIndex);
  try {
    localStorage.setItem(LAST_PHRASE_KEY, String(index));
  } catch {
    // 무시
  }
  return DAILY_PHRASES[index];
})();

function renderDailyPhrase() {
  if (!elements.dailyPhraseText) return;
  const phrase = sessionPhrase;
  if (elements.dailyPhraseText.textContent !== phrase) {
    elements.dailyPhraseText.textContent = phrase;
    fitDailyPhrase();
  }
}

function fitDailyPhrase() {
  const text = elements.dailyPhraseText;
  const area = text?.parentElement;
  if (!area || !area.clientWidth || !area.clientHeight) return;
  // 간판의 안전 영역 안에 전체 문장이 들어가도록 축소 (생략/잘라내기 없음).
  let size = 16;
  text.style.fontSize = `${size}px`;
  while (size > 6 && (text.scrollWidth > area.clientWidth || text.scrollHeight > area.clientHeight)) {
    size -= 0.5;
    text.style.fontSize = `${size}px`;
  }
}

function setupPhraseSign() {
  const card = document.querySelector("#dailyPhraseCard");
  if (!card) return;
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(fitDailyPhrase).observe(card);
  window.addEventListener("resize", fitDailyPhrase);
  if (document.fonts?.ready) document.fonts.ready.then(fitDailyPhrase);
  requestAnimationFrame(fitDailyPhrase);
}

function renderGrowthCard() {
  if (!elements.growthNextHint) return;
  const nextLevel = getNextGameLevel(state.level);
  if (nextLevel) {
    elements.growthProgressLabel.textContent = `${formatWeight(state.consumed)} / ${formatWeight(nextLevel.requiredConsumed)}`;
    elements.growthNextHint.textContent = `다음 LV.${nextLevel.level}까지 필요한 쌀 소비량: ${formatWeight(Math.max(0, nextLevel.requiredConsumed - state.consumed))}`;
  } else {
    elements.growthProgressLabel.textContent = "최고 LV 달성";
    elements.growthNextHint.textContent = `누적 쌀 소비량: ${formatWeight(state.consumed)}`;
  }
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function formatMultiplier(value) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function renderBoosterStatusPanel() {
  if (!elements.boosterStatusPanel) return;
  const remainingSeconds = Math.max(0, ((state.boosterEndTime || 0) - Date.now()) / 1000);
  const isActive = remainingSeconds > 0;

  elements.boosterStatusPanel.classList.toggle("is-active", isActive);

  if (isActive) {
    const multiplier = getBoosterMultiplier();
    elements.boosterStatusHeadline.textContent = "부스터 활성화 중!";
    elements.boosterStatusLabel1.textContent = "남은 시간";
    elements.boosterStatusValue1.textContent = `🕐 ${formatDuration(remainingSeconds)}`;
    elements.boosterStatusLabel2.textContent = "효과";
    elements.boosterStatusValue2.textContent = `수확량 ${formatMultiplier(multiplier)}배 (x${formatMultiplier(multiplier)})`;
  } else if (state.boosterCount > 0) {
    const previewMultiplier = getBaseBoosterMultiplier() + getNextBoosterRecipeBonus();
    const previewDuration = getNextBoosterDuration();
    elements.boosterStatusHeadline.textContent = "비료 부스터 대기 중";
    elements.boosterStatusLabel1.textContent = "보유 개수";
    elements.boosterStatusValue1.textContent = `x${state.boosterCount}`;
    elements.boosterStatusLabel2.textContent = "효과 미리보기";
    elements.boosterStatusValue2.textContent = `수확량 ${formatMultiplier(previewMultiplier)}배 · ${previewDuration}초`;
  } else {
    const previewMultiplier = getBaseBoosterMultiplier() + getNextBoosterRecipeBonus();
    const previewDuration = getNextBoosterDuration();
    elements.boosterStatusHeadline.textContent = "비료 부스터가 없어요";
    elements.boosterStatusLabel1.textContent = "획득 방법";
    elements.boosterStatusValue1.textContent = "LV업 · 미션 · 소비 보상";
    elements.boosterStatusLabel2.textContent = "효과";
    elements.boosterStatusValue2.textContent = `수확량 ${formatMultiplier(previewMultiplier)}배 · ${previewDuration}초`;
  }
}

function renderStages() {
  elements.stageList.innerHTML = "";
  for (const stage of BACKGROUND_STAGES) {
    const div = document.createElement("div");
    div.className = `stage${state.consumed >= stage.threshold ? " active" : ""}`;
    div.innerHTML = `<span>${stage.name}</span>`;
    elements.stageList.append(div);
  }
}

function renderLevelDialog() {
  if (!elements.levelDialogList) return;
  elements.levelDialogList.innerHTML = "";
  for (const entry of GAME_LEVELS) {
    const reached = state.level >= entry.level;
    const div = document.createElement("div");
    div.className = `game-card${reached ? " claimed" : ""}`;
    const rewardLabel = entry.reward.label || (entry.reward.type === "none" ? "기본 시작" : "");
    div.innerHTML = `
      <span class="card-icon">${entry.level}</span>
      <span>
        <span class="card-title">LV.${entry.level} ${entry.title}</span>
        <span class="card-meta">누적 소비량 ${formatWeight(entry.requiredConsumed)} 필요</span>
        <span class="card-note">${rewardLabel}</span>
      </span>
      <span class="card-cost">${reached ? "달성" : "미달성"}</span>
    `;
    elements.levelDialogList.append(div);
  }
}

function renderUpgrades() {
  elements.upgradeList.innerHTML = "";
  renderToolCard("click", "수동 수확", state.clickTool, TOOL_CONFIG.click, TOOL_TIER_NAMES.click, getTapPower());
  renderToolCard("auto", "자동 수확", state.autoTool, TOOL_CONFIG.auto, TOOL_TIER_NAMES.auto, getPerSecond());
}

function renderToolCard(kind, label, tool, config, names, currentOutput) {
  const wrap = document.createElement("div");
  wrap.className = "tool-card";

  const innerCost = getInnerUpgradeCost(tool, config);
  const basePower = tierBasePower(tool.tier);
  const nextInnerPower = basePower * (1 + config.innerLevelGrowth * tool.level);
  const canInnerUpgrade = state.rice >= innerCost;

  const nextTierUnlocked = isNextTierUnlocked(tool, config);
  const nextTierCost = getNextTierCost(tool, config);
  const isMaxTier = tool.tier >= config.tierCount;

  wrap.innerHTML = `
    <div class="tool-card-header">
      <strong>${label}: ${names[tool.tier - 1]}</strong>
      <span>T${tool.tier} · 내부 Lv.${tool.level}</span>
    </div>
    <div class="tool-card-stats">
      <span>현재 ${kind === "click" ? "클릭당" : "초당"} 수확량: <strong>${formatWeight(currentOutput)}</strong></span>
    </div>
    <button type="button" class="game-card tool-upgrade-btn" ${canInnerUpgrade ? "" : "disabled"}>
      <span class="card-icon">⬆</span>
      <span>
        <span class="card-title">내부 강화 (Lv.${tool.level} → ${tool.level + 1})</span>
        <span class="card-meta">${kind === "click" ? "클릭당" : "초당"} ${formatWeight(basePower * (1 + config.innerLevelGrowth * (tool.level - 1)))} → ${formatWeight(nextInnerPower)}</span>
      </span>
      <span class="card-cost">${formatWeight(innerCost)}</span>
    </button>
    ${
      isMaxTier
        ? `<p class="tool-tier-note">최고 티어입니다.</p>`
        : `<button type="button" class="game-card tool-tier-btn" ${nextTierUnlocked && state.rice >= nextTierCost ? "" : "disabled"}>
            <span class="card-icon">🔒</span>
            <span>
              <span class="card-title">다음 티어: ${names[tool.tier]}</span>
              <span class="card-meta">${nextTierUnlocked ? "구매 시 티어 교체, 내부 Lv.1부터 시작" : `게임 LV.${tool.tier + 1} 필요`}</span>
            </span>
            <span class="card-cost">${nextTierUnlocked ? formatWeight(nextTierCost) : "잠김"}</span>
          </button>`
    }
  `;

  wrap.querySelector(".tool-upgrade-btn").addEventListener("click", () => buyInnerUpgrade(kind));
  const tierBtn = wrap.querySelector(".tool-tier-btn");
  if (tierBtn) tierBtn.addEventListener("click", () => buyNextTier(kind));

  elements.upgradeList.append(wrap);
}

function getRecipeEffectNote(recipe) {
  if (recipe.buff) {
    const label = { click: "클릭", auto: "자동", all: "전체" }[recipe.buff.type];
    const remaining = (state.buffs[`${recipe.buff.type}Until`] - Date.now()) / 1000;
    return `${recipe.buff.duration}초 × 수량 · ${label} 수확 ×${recipe.buff.multiplier}`
      + (remaining > 0 ? ` · 남은 시간 ${formatDuration(remaining)}` : "");
  }
  if (recipe.boosterDurationBonusSeconds) {
    return `다음 부스터 +${recipe.boosterDurationBonusSeconds}초 × 수량 · 적립 +${state.boosterDurationBonusSeconds}초`;
  }
  return `다음 부스터 +${recipe.boosterMultiplierBonus}배 · 수량만큼 횟수 적립 (${state.boosterMultiplierCharges}회 대기)`;
}

function renderRecipes() {
  if (!elements.recipeQtyButtons) return;
  elements.recipeQtyButtons.innerHTML = "";
  for (const option of RECIPE_QUANTITY_OPTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `qty-btn${selectedRecipeQty === option ? " active" : ""}`;
    btn.textContent = option === "MAX" ? "MAX" : `×${option}`;
    btn.addEventListener("click", () => setRecipeQty(option));
    elements.recipeQtyButtons.append(btn);
  }

  elements.recipeCount.textContent = `${getUnlockedRecipeCount()}/${RECIPES.length} 해금`;
  elements.recipeList.innerHTML = "";
  for (const recipe of RECIPES) {
    const unlocked = isRecipeUnlocked(recipe);
    const qty = unlocked ? getRecipeQty(recipe) : 0;
    const totalCost = recipe.cost * qty;
    const button = document.createElement("button");
    button.className = "game-card";
    button.type = "button";
    button.disabled = !unlocked || qty <= 0 || state.rice < totalCost;
    button.innerHTML = `
      <span class="card-icon"><img src="${recipe.icon}" alt="" /></span>
      <span>
        <span class="card-title">${recipe.name}${qty > 1 ? ` ×${qty}` : ""}</span>
        <span class="card-meta">${unlocked ? getRecipeEffectNote(recipe) : `누적 소비 ${formatWeight(recipe.unlockConsumed)} 필요`}</span>
        <span class="card-note">사용 ${state.recipeUses[recipe.id]}회</span>
      </span>
      <span class="card-cost">${unlocked ? formatWeight(totalCost) : "잠김"}</span>
    `;
    button.addEventListener("click", () => useRecipe(recipe));
    elements.recipeList.append(button);
  }
}

// 게임 루프가 300ms마다 render()를 호출하므로, 버튼을 매번 새로 만들면 누르는 도중
// (mousedown ~ mouseup 사이) 노드가 교체되어 클릭이 씹힌다. 버튼은 처음 한 번만 만들고
// 이후에는 바뀐 클래스/활성 상태/내용만 갱신한다.
function renderStableButtonList(container, items, getView, onClick) {
  if (container.children.length !== items.length) {
    container.innerHTML = "";
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.addEventListener("click", () => onClick(item));
      container.append(button);
    }
  }
  items.forEach((item, index) => {
    const button = container.children[index];
    const view = getView(item);
    if (button.className !== view.className) button.className = view.className;
    button.disabled = Boolean(view.disabled);
    if (button.renderedHtml !== view.html) {
      button.renderedHtml = view.html;
      button.innerHTML = view.html;
    }
  });
}

function renderMissions() {
  const containers = [elements.missionList, elements.missionDialogList].filter(Boolean);
  const getView = (mission) => {
    const progress = Math.min(state.dailyProgress[mission.type] || 0, mission.target);
    const done = progress >= mission.target;
    const claimed = state.dailyClaimed[mission.id];
    return {
      className: `game-card${claimed ? " claimed" : ""}`,
      disabled: !done || claimed,
      html: `
        <span class="card-icon"><img src="./assets/images/ui/ui_mission.png" alt="" /></span>
        <span>
          <span class="card-title">${mission.name}</span>
          <span class="card-meta">${mission.conditionText} (${progress}/${mission.target})</span>
          <span class="card-note">${mission.reward.label}</span>
        </span>
        <span class="card-cost">${claimed ? "완료" : done ? "받기" : "진행 중"}</span>
      `,
    };
  };
  for (const container of containers) {
    renderStableButtonList(container, DAILY_MISSIONS, getView, claimDailyMission);
  }
}

function formatMilestoneWeight(amount) {
  return amount >= 1e6 ? `${amount / 1e6}t` : formatWeight(amount);
}

function renderAttendance() {
  if (elements.attendanceList) {
    renderStableButtonList(elements.attendanceList, ATTENDANCE_REWARDS, (reward) => {
      const claimed = state.attendance.claimedDays[reward.day];
      const unlocked = state.attendance.count >= reward.day;
      return {
        className: `game-card${claimed ? " claimed" : ""}`,
        disabled: !unlocked || claimed,
        html: `
          <span class="card-icon">${claimed ? "✔" : unlocked ? "🎁" : "🔒"}</span>
          <span>
            <span class="card-title">${reward.day}일차${reward.isFinal ? " (마지막)" : ""}</span>
            <span class="card-meta">${reward.label}</span>
          </span>
          <span class="card-cost">${claimed ? "완료" : unlocked ? "받기" : "대기"}</span>
        `,
      };
    }, (reward) => claimAttendanceReward(reward.day));
  }

  const attendanceQuickBtn = document.querySelector('.quick-menu-btn[data-quick="attendance"]');
  if (attendanceQuickBtn) {
    const hasClaimable = ATTENDANCE_REWARDS.some(
      (reward) => state.attendance.count >= reward.day && !state.attendance.claimedDays[reward.day]
    );
    attendanceQuickBtn.classList.toggle("has-badge", hasClaimable);
  }
}

function renderMilestones() {
  const list = elements.milestoneList;
  // 게임 루프의 반복 렌더링 중 노드를 교체하지 않아 드래그/터치 스크롤을 보존합니다.
  if (!list.children.length) {
    for (const milestone of milestones) {
      const card = document.createElement("article");
      card.dataset.milestoneId = milestone.id;
      list.append(card);
    }
  }
  const currentIndex = milestones.findIndex((milestone) => !state.claimedMilestones[milestone.id]);
  milestones.forEach((milestone, index) => {
    const card = list.children[index];
    const done = Boolean(state.claimedMilestones[milestone.id]);
    const current = index === currentIndex;
    const progress = Math.max(0, Math.min(state.consumed / milestone.amount * 100, 100));
    card.className = `milestone ${done ? "done" : current ? "current" : "locked"}`;
    card.setAttribute("aria-current", current ? "step" : "false");
    const markup = `
      <span class="milestone-status">${done ? "✓ 완료" : current ? "진행 중" : "🔒 잠금"}</span>
      <strong>${formatMilestoneWeight(milestone.amount)}</strong>
      <span>${milestone.reward.label}</span>
      ${current ? `<span>${formatMilestoneWeight(state.consumed)} / ${formatMilestoneWeight(milestone.amount)}</span>
        <div class="progress-track" role="progressbar" aria-label="소비 진행도"
          aria-valuenow="${Math.floor(progress)}" aria-valuemin="0" aria-valuemax="100">
          <span style="width: ${progress}%"></span>
        </div>` : ""}
    `;
    if (card.innerHTML !== markup) card.innerHTML = markup;
  });
}

function centerCurrentMilestone() {
  const list = elements.milestoneList;
  if (!list.clientWidth) return;
  const card = list.querySelector(".current") || list.lastElementChild;
  if (!card) return;
  const listRect = list.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  list.scrollLeft += cardRect.left - listRect.left - (list.clientWidth - cardRect.width) / 2;
}

function setupMilestoneDrag() {
  const list = elements.milestoneList;
  let drag = null;
  list.addEventListener("pointerdown", (event) => {
    // 모바일은 브라우저 기본 터치/관성 스크롤을 사용합니다.
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag = { pointerId: event.pointerId, x: event.clientX, scroll: list.scrollLeft };
    list.setPointerCapture(event.pointerId);
    list.classList.add("dragging");
    event.preventDefault();
  });
  list.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    list.scrollLeft = drag.scroll - (event.clientX - drag.x);
  });
  const stop = () => {
    drag = null;
    list.classList.remove("dragging");
  };
  list.addEventListener("pointerup", stop);
  list.addEventListener("pointercancel", stop);
  list.addEventListener("lostpointercapture", stop);
}

function renderStatsSummary() {
  elements.statsSummary.innerHTML = `
    <div class="stats-item"><span>보유 쌀알</span><strong>${formatRiceAmount(getDisplayedRice())}</strong></div>
    <div class="stats-item"><span>누적 쌀 소비량</span><strong>${formatWeight(state.consumed)}</strong></div>
    <div class="stats-item"><span>게임 LV</span><strong>Lv. ${state.level}<br />${getGameLevelInfo(state.level).title}</strong></div>
    <div class="stats-item"><span>비료 부스터</span><strong>${state.boosterCount}개 보유</strong></div>
  `;
}

function renderStatsUpgrades() {
  elements.statsUpgradeList.innerHTML = "";
  const rows = [
    { label: "수동 수확 장비", tool: state.clickTool, names: TOOL_TIER_NAMES.click, icon: "./assets/images/upgrades/upgrade_sickle.png" },
    { label: "자동 수확 설비", tool: state.autoTool, names: TOOL_TIER_NAMES.auto, icon: "./assets/images/upgrades/upgrade_irrigation.png" },
  ];
  for (const row of rows) {
    const div = document.createElement("div");
    div.className = "game-card";
    div.innerHTML = `
      <span class="card-icon"><img src="${row.icon}" alt="" /></span>
      <span>
        <span class="card-title">${row.label}: ${row.names[row.tool.tier - 1]}</span>
        <span class="card-meta">T${row.tool.tier} · 내부 Lv.${row.tool.level}</span>
      </span>
      <span class="card-cost">보유 중</span>
    `;
    elements.statsUpgradeList.append(div);
  }
}

function renderStorage() {
  if (elements.storageRecipeList) {
    elements.storageRecipeList.innerHTML = "";
    for (const recipe of RECIPES) {
      const unlocked = isRecipeUnlocked(recipe);
      const card = document.createElement("div");
      card.className = `storage-recipe-card${unlocked ? "" : " locked"}`;
      card.innerHTML = unlocked
        ? `
            <div class="storage-recipe-icon"><img src="${recipe.icon}" alt="" /></div>
            <div class="storage-recipe-name">${recipe.name}</div>
            <div class="storage-recipe-meta">${state.recipeUses[recipe.id] || 0}회 사용</div>
          `
        : `
            <div class="storage-recipe-icon">🔒</div>
            <div class="storage-recipe-name">${recipe.name}</div>
            <div class="storage-recipe-meta">누적 소비 ${formatWeight(recipe.unlockConsumed)} 필요</div>
          `;
      elements.storageRecipeList.append(card);
    }
  }

  if (elements.storageLevelList) {
    elements.storageLevelList.innerHTML = "";
    for (const entry of GAME_LEVELS) {
      const received = state.level >= entry.level;
      const row = document.createElement("div");
      row.className = `storage-level-row${received ? " received" : ""}`;
      const rewardLabel = entry.reward.label || (entry.reward.type === "none" ? "기본 시작" : "");
      row.innerHTML = `
        <span class="storage-level-icon">${received ? "✔" : "🔒"}</span>
        <span class="storage-level-num">LV.${entry.level}</span>
        <span class="storage-level-title">${entry.title}</span>
        <span class="storage-level-reward">${rewardLabel}</span>
      `;
      elements.storageLevelList.append(row);
    }
  }
}

function render() {
  renderStats();
  renderStages();
  renderUpgrades();
  renderRecipes();
  renderMissions();
  renderAttendance();
  renderEvent();
  renderMilestones();
  renderStatsSummary();
  renderStatsUpgrades();
  renderLevelDialog();
  renderStorage();
}

// ----------------------------------------------------------------------------
// 시연 전용 관리자 모드 — ADMIN_MODE_ENABLED=false로 진입/지급 모두 차단
// ----------------------------------------------------------------------------
function addAdminRice(rawAmount, unit = "kg") {
  if (!ADMIN_MODE_ENABLED) return false;
  const text = String(rawAmount).trim();
  const units = { g: 1, kg: 1000, t: 1000000 };
  if (!/^[0-9]+$/.test(text) || !Object.prototype.hasOwnProperty.call(units, unit)) {
    showToast("양의 정수를 입력해주세요. (숫자만 허용)");
    return false;
  }
  const amount = Number(text) * units[unit];
  const nextRice = state.rice + amount;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > ADMIN_CONFIG.maxGrantRice
      || !Number.isFinite(state.rice) || state.rice < 0 || !Number.isFinite(nextRice)
      || nextRice > ADMIN_CONFIG.maxRiceBalance || nextRice <= state.rice) {
    showToast(`지급은 1g~${formatWeight(ADMIN_CONFIG.maxGrantRice)} 범위이며 보유량 상한을 넘을 수 없어요.`);
    return false;
  }
  // gainRice()는 누적/주간 수확량도 바꾸므로 관리자 지급에는 사용하지 않습니다.
  startRiceTween(amount);
  state.rice = nextRice;
  saveState(true);
  elements.rice.textContent = formatRiceAmount(getDisplayedRice());
  renderUpgrades();
  renderRecipes();
  renderStatsSummary();
  showToast(`쌀알 +${formatWeight(amount)} 지급 완료`);
  return true;
}

function setupAdminMode() {
  if (!ADMIN_MODE_ENABLED) return;
  const trigger = document.querySelector("#adminModeTrigger");
  const panel = document.querySelector("#adminPanel");
  const input = document.querySelector("#adminRiceInput");
  let clickCount = 0;
  let firstClickAt = 0;
  let resetTimer = 0;
  const resetClicks = () => { clickCount = 0; firstClickAt = 0; };
  const positionPanel = () => {
    panel.style.top = `${document.querySelector(".play-area").offsetTop}px`;
  };
  trigger.addEventListener("click", () => {
    const now = performance.now();
    if (!clickCount || now - firstClickAt >= ADMIN_CONFIG.clickWindowMs) {
      resetClicks();
      firstClickAt = now;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(resetClicks, ADMIN_CONFIG.clickWindowMs);
    }
    clickCount += 1;
    if (clickCount < ADMIN_CONFIG.clickCount) return;
    clearTimeout(resetTimer);
    resetClicks();
    positionPanel();
    panel.hidden = false;
    input.focus({ preventScroll: true });
  });
  panel.querySelectorAll("[data-admin-rice]").forEach((button) => {
    button.addEventListener("click", () => addAdminRice(button.dataset.adminRice, "g"));
  });
  document.querySelector("#adminRiceForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (addAdminRice(input.value, document.querySelector("#adminRiceUnit").value)) input.value = "";
  });
  const close = () => { panel.hidden = true; trigger.focus({ preventScroll: true }); };
  document.querySelector("#closeAdminButton").addEventListener("click", close);
  panel.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  window.addEventListener("resize", positionPanel);
}

// ----------------------------------------------------------------------------
// 이벤트 바인딩
// ----------------------------------------------------------------------------
elements.harvestButton.addEventListener("click", (event) => {
  const amount = getTapPower();
  gainRice(amount);
  state.dailyProgress.click = (state.dailyProgress.click || 0) + 1;
  advanceEvent("click");
  const rect = elements.harvestButton.getBoundingClientRect();
  const layerRect = elements.floatLayer.getBoundingClientRect();
  showFloat(amount, rect.left - layerRect.left + rect.width / 2, rect.top - layerRect.top + rect.height / 2);
  playGameSound("click");
  elements.harvestButton.classList.add("harvest-pop");
  setTimeout(() => elements.harvestButton.classList.remove("harvest-pop"), 220);
  render();
});

elements.saveButton.addEventListener("click", () => {
  saveState(false);
  playGameSound("click");
});
elements.resetButton.addEventListener("click", resetGame);
elements.soundButton.addEventListener("click", () => {
  state.soundEnabled = !state.soundEnabled;
  renderStats();
  if (state.soundEnabled) playGameSound("click");
  saveState(true);
});
if (elements.useBoosterButton) {
  elements.useBoosterButton.addEventListener("click", useBooster);
}
if (elements.levelLabel) {
  elements.levelLabel.parentElement.style.cursor = "pointer";
  elements.levelLabel.parentElement.addEventListener("click", () => {
    renderLevelDialog();
    if (elements.levelDialog.showModal) elements.levelDialog.showModal();
  });
}
// 다이얼로그 닫기(우측 상단 X, 축제 CTA 버튼 포함)는 index.html의 [data-close] 공통 핸들러가 처리합니다.
window.addEventListener("resize", resizeCanvas);
window.addEventListener("beforeunload", () => saveState(true));

setInterval(() => saveState(true), 15000);

function gameLoop(now) {
  const deltaSeconds = Math.min((now - lastTick) / 1000, 0.25);
  lastTick = now;

  const passiveGain = getPerSecond() * deltaSeconds;
  if (passiveGain > 0) gainRice(passiveGain, { instant: true });

  renderStats();
  if (now - lastFullRender > 300) {
    checkDailyAndWeeklyReset();
    checkEventState();
    checkMilestones();
    render();
    lastFullRender = now;
  }
  drawField(now);
  requestAnimationFrame(gameLoop);
}

setupAdminMode();
setupMilestoneDrag();
setupPhraseSign();
resizeCanvas();
checkGameLevelUp();
checkMilestones();
checkDailyAndWeeklyReset();
checkEventState();
if (elements.eventSkipButton) elements.eventSkipButton.addEventListener("click", skipEvent);
render();
syncFromServer();
requestAnimationFrame(gameLoop);
