const STORAGE_KEY = "ollies-harvest-save-v1";
const API_BASE_URL = "http://127.0.0.1:8000";
const BASE_PASSIVE_HARVEST = 15;
const FESTIVAL_CONSUMPTION_GOAL = 30000;
const FESTIVAL_POPULARITY_GOAL = 100;
const FESTIVAL_RECIPE_GOAL = 5;
const OLLIE_HARVEST_IMAGE = "./assets/images/characters/ollie_harvest.png";

const stages = [
  { name: "모내기", threshold: 0, icon: "./assets/images/stages/stage_planting.png" },
  { name: "벼 성장", threshold: 500, icon: "./assets/images/stages/stage_growing.png" },
  { name: "수확", threshold: 1500, icon: "./assets/images/stages/stage_harvest.png" },
  { name: "도정", threshold: 4000, icon: "./assets/images/stages/stage_milling.png" },
  { name: "밥 짓기", threshold: 8000, icon: "./assets/images/stages/stage_cooking.png" },
  { name: "레시피 개발", threshold: 15000, icon: "./assets/images/stages/stage_recipe.png" },
  { name: "작은 쌀 축제", threshold: FESTIVAL_CONSUMPTION_GOAL, icon: "./assets/images/stages/stage_festival.png" },
];

const upgrades = [
  {
    id: "seed",
    name: "좋은 볍씨",
    icon: "./assets/images/upgrades/upgrade_seed.png",
    baseCost: 25,
    scale: 1.15,
    type: "생산",
    effectText: "초당 수확 +1g",
    perSecond: 1,
  },
  {
    id: "water",
    name: "자동 물대기",
    icon: "./assets/images/upgrades/upgrade_irrigation.png",
    baseCost: 100,
    scale: 1.17,
    type: "생산",
    effectText: "초당 수확 +5g",
    perSecond: 5,
  },
  {
    id: "helper",
    name: "수확 도우미",
    icon: "./assets/images/upgrades/upgrade_helper.png",
    baseCost: 450,
    scale: 1.18,
    type: "생산",
    effectText: "초당 수확 +20g",
    perSecond: 20,
  },
  {
    id: "sickle",
    name: "튼튼한 낫",
    icon: "./assets/images/upgrades/upgrade_sickle.png",
    baseCost: 80,
    scale: 1.2,
    type: "클릭",
    effectText: "클릭 수확 +3g",
    tapBonus: 3,
  },
  {
    id: "cooker",
    name: "밥솥 업그레이드",
    icon: "./assets/images/upgrades/upgrade_cooker.png",
    baseCost: 300,
    scale: 1.22,
    type: "소비",
    effectText: "레시피 인기도 +10%",
    popularityBonus: 0.1,
  },
  {
    id: "package",
    name: "포장 아이디어",
    icon: "./assets/images/upgrades/upgrade_package.png",
    baseCost: 700,
    scale: 1.25,
    type: "소비",
    effectText: "누적 소비량 +5%",
    consumptionBonus: 0.05,
  },
];

const recipes = [
  {
    id: "meal",
    name: "밥 짓기",
    icon: "./assets/images/recipes/recipe_rice_bowl.png",
    cost: 150,
    unlockPopularity: 0,
    popularity: 3,
    xp: 10,
    note: "가장 든든한 시작",
    message: "올리가 따뜻한 밥 한 그릇을 지었어요. 쌀의 가장 든든한 시작이에요.",
  },
  {
    id: "kimbap",
    name: "김밥 만들기",
    icon: "./assets/images/recipes/recipe_kimbap.png",
    cost: 120,
    unlockPopularity: 10,
    popularity: 4,
    xp: 12,
    buff: { type: "click", multiplier: 1.5, duration: 30 },
    note: "30초간 클릭 수확 +50%",
    message: "올리의 김밥이 소풍길에 인기를 얻었어요. 신이 난 올리가 더 힘차게 수확해요.",
  },
  {
    id: "tteok",
    name: "떡 만들기",
    icon: "./assets/images/recipes/recipe_tteok.png",
    cost: 250,
    unlockPopularity: 25,
    popularity: 8,
    xp: 18,
    buff: { type: "auto", multiplier: 1.5, duration: 30 },
    note: "30초간 자동 수확 +50%",
    message: "마을 사람들이 떡을 나누며 올리를 도와주기 시작했어요.",
  },
  {
    id: "bread",
    name: "쌀빵 굽기",
    icon: "./assets/images/recipes/recipe_rice_bread.png",
    cost: 300,
    unlockPopularity: 45,
    popularity: 15,
    xp: 30,
    note: "새로운 쌀 소비 이미지",
    message: "쌀빵이 새 손님들의 관심을 끌었어요. 쌀의 새로운 매력이 알려지고 있어요.",
  },
  {
    id: "nurungji",
    name: "누룽지 만들기",
    icon: "./assets/images/recipes/recipe_nurungji.png",
    cost: 200,
    unlockPopularity: 70,
    popularity: 6,
    xp: 20,
    autoMultiplierBonus: 0.02,
    note: "영구 자동 수확 +2%",
    message: "남은 밥도 고소한 누룽지가 되었어요. 올리의 농장은 쌀을 알뜰하게 쓰는 법을 배웠어요.",
  },
];

const missions = [
  {
    id: "firstHarvest",
    name: "첫 수확",
    conditionText: "쌀 50g 수확",
    rewardText: "쌀알 +50",
    isComplete: () => state.totalHarvested >= 50,
    reward: () => {
      gainRice(50);
    },
  },
  {
    id: "firstMeal",
    name: "밥 한 그릇",
    conditionText: "밥 짓기 1회",
    rewardText: "인기도 +5",
    isComplete: () => state.recipeUses.meal >= 1,
    reward: () => {
      state.popularity += 5;
    },
  },
  {
    id: "startConsume",
    name: "쌀 소비 시작",
    conditionText: "누적 소비량 1kg",
    rewardText: "쌀알 +300",
    isComplete: () => state.consumed >= 1000,
    reward: () => {
      gainRice(300);
    },
  },
  {
    id: "popularMenu",
    name: "인기 메뉴 탄생",
    conditionText: "김밥 만들기 3회",
    rewardText: "클릭 수확 +5g",
    isComplete: () => state.recipeUses.kimbap >= 3,
    reward: () => {
      state.missionTapBonus += 5;
    },
  },
  {
    id: "festivalPrep",
    name: "축제 준비",
    conditionText: "누적 소비량 10kg",
    rewardText: "인기도 +20",
    isComplete: () => state.consumed >= 10000,
    reward: () => {
      state.popularity += 20;
    },
  },
];

const milestones = [
  { id: "m1", amount: 1000, rewardText: "인기도 +5", message: "쌀 소비의 첫걸음을 뗐어요.", reward: () => (state.popularity += 5) },
  { id: "m5", amount: 5000, rewardText: "쌀알 +1,000", message: "이웃들이 올리의 밥상을 알게 됐어요.", reward: () => gainRice(1000) },
  { id: "m10", amount: 10000, rewardText: "인기도 +10", message: "마을 장터에 올리의 쌀 음식이 등장했어요.", reward: () => (state.popularity += 10) },
  { id: "m20", amount: 20000, rewardText: "자동 수확 +10%", message: "올리의 레시피가 입소문을 타기 시작했어요.", reward: () => (state.milestoneAutoBonus += 0.1) },
  { id: "m30", amount: FESTIVAL_CONSUMPTION_GOAL, rewardText: "작은 쌀 축제 가능", message: "작은 쌀 축제를 열 준비가 됐어요.", reward: () => {} },
];

const initialState = {
  rice: 0,
  consumed: 0,
  totalHarvested: 0,
  popularity: 0,
  xp: 0,
  level: 1,
  missionTapBonus: 0,
  milestoneAutoBonus: 0,
  recipeAutoBonus: 0,
  soundEnabled: true,
  festivalHeld: false,
  lastSavedAt: Date.now(),
  owned: Object.fromEntries(upgrades.map((upgrade) => [upgrade.id, 0])),
  recipeUses: Object.fromEntries(recipes.map((recipe) => [recipe.id, 0])),
  claimedMissions: Object.fromEntries(missions.map((mission) => [mission.id, false])),
  claimedMilestones: Object.fromEntries(milestones.map((milestone) => [milestone.id, false])),
  buffs: {
    clickUntil: 0,
    autoUntil: 0,
  },
};

let state = loadState();
let lastTick = performance.now();
let lastFullRender = 0;
let toastTimer = 0;
let ollieReactionTimer = 0;
let audioContext;

const elements = {
  field: document.querySelector(".field"),
  rice: document.querySelector("#rice"),
  consumed: document.querySelector("#consumed"),
  popularity: document.querySelector("#popularity"),
  perSecond: document.querySelector("#perSecond"),
  tapValue: document.querySelector("#tapValue"),
  levelLabel: document.querySelector("#levelLabel"),
  xpBar: document.querySelector("#xpBar"),
  stageList: document.querySelector("#stageList"),
  recipeCount: document.querySelector("#recipeCount"),
  recipeList: document.querySelector("#recipeList"),
  upgradeList: document.querySelector("#upgradeList"),
  missionList: document.querySelector("#missionList"),
  milestoneList: document.querySelector("#milestoneList"),
  statsSummary: document.querySelector("#statsSummary"),
  statsUpgradeList: document.querySelector("#statsUpgradeList"),
  rankingList: document.querySelector("#rankingList"),
  friendRequestForm: document.querySelector("#friendRequestForm"),
  friendUsernameInput: document.querySelector("#friendUsernameInput"),
  friendRequestMessage: document.querySelector("#friendRequestMessage"),
  friendRequestList: document.querySelector("#friendRequestList"),
  friendList: document.querySelector("#friendList"),
  festivalGoal: document.querySelector("#festivalGoal"),
  festivalHint: document.querySelector("#festivalHint"),
  festivalButton: document.querySelector("#festivalButton"),
  buffSummary: document.querySelector("#buffSummary"),
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
  closeFestivalButton: document.querySelector("#closeFestivalButton"),
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

function cloneInitialState() {
  return JSON.parse(JSON.stringify(initialState));
}

function normalizeState(saved) {
  const merged = {
    ...cloneInitialState(),
    ...saved,
    owned: { ...initialState.owned, ...saved.owned },
    recipeUses: { ...initialState.recipeUses, ...saved.recipeUses },
    claimedMissions: { ...initialState.claimedMissions, ...saved.claimedMissions },
    claimedMilestones: { ...initialState.claimedMilestones, ...saved.claimedMilestones },
    buffs: { ...initialState.buffs, ...saved.buffs },
  };

  const elapsed = Math.max(0, (Date.now() - (saved.lastSavedAt || Date.now())) / 1000);
  const offlineSeconds = Math.min(elapsed, 60 * 60 * 4);
  const offlineGain = getPerSecond(merged, { ignoreTimedBuffs: true }) * offlineSeconds * getOfflineMultiplier(merged);
  if (offlineGain >= 1) {
    merged.rice += offlineGain;
    merged.totalHarvested += offlineGain;
    setTimeout(() => showToast(`쉬는 동안 올리가 +${formatWeight(offlineGain)}을 수확했어요.`), 300);
  }
  return merged;
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("currentUser"));
  } catch {
    return null;
  }
}

// 계정별로 로컬 저장을 분리한다. 같은 브라우저에서 여러 계정을 오가며 플레이해도
// 서로 다른 계정의 진행 데이터가 섞이지 않도록 사용자 id를 키에 포함한다.
function getStorageKey() {
  const user = getCurrentUser();
  return user ? `${STORAGE_KEY}:${user.id}` : STORAGE_KEY;
}

// initialState.lastSavedAt은 스크립트가 처음 로드될 때의 시각으로 고정되어 있어
// "실제로 저장된 적 없는 상태"인지 구분할 수 없다. 이 플래그로 별도 추적한다.
let hasLocalSave = false;

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

// 로그인 상태일 때 서버에 저장된 세이브를 불러와 로컬보다 최신이면 반영한다.
// 로컬에 실제 저장 기록이 없다면(새 기기 등) 타임스탬프 비교 없이 서버 데이터를 우선한다.
// 서버 연결에 실패해도 로컬 저장 데이터로 계속 플레이할 수 있어야 하므로 오류는 조용히 무시한다.
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
      hasLocalSave = true;
      render();
    }
  } catch {
    // 서버에 연결할 수 없으면 로컬 저장 데이터로 계속 진행한다.
  }
}

// 주의: user_id를 그대로 실어 보내며 서버는 별도 인증 없이 이를 신뢰한다 (TODO.md 4.3 참고).
function pushToServer() {
  const user = getCurrentUser();
  if (!user) return;

  fetch(`${API_BASE_URL}/save`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: user.id, data: state }),
  }).catch(() => {
    // 서버에 연결할 수 없으면 로컬 저장만 유지한다.
  });
}

// 랭킹 탭을 열 때 index.html의 탭 전환 스크립트에서 호출한다 (누적 쌀 소비량 기준, 서버 전체 사용자 대상).
async function loadLeaderboard() {
  if (!elements.rankingList) return;
  elements.rankingList.innerHTML = '<p class="screen-placeholder">불러오는 중...</p>';

  try {
    const res = await fetch(`${API_BASE_URL}/leaderboard`);
    if (!res.ok) throw new Error("leaderboard request failed");
    const payload = await res.json();
    renderLeaderboard(payload.entries);
  } catch {
    elements.rankingList.innerHTML = '<p class="screen-placeholder">랭킹을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.</p>';
  }
}

function renderLeaderboard(entries) {
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
      <span class="card-icon">${entry.rank}</span>
      <span>
        <span class="card-title">${entry.nickname}${isMe ? " (나)" : ""}</span>
        <span class="card-meta">누적 쌀 소비량</span>
      </span>
      <span class="card-cost">${formatWeight(entry.consumed)}</span>
    `;
    elements.rankingList.append(div);
  }
}

// 친구 탭을 열 때 index.html의 탭 전환 스크립트에서 호출한다.
// 요청 → 수락 플로우: 아이디로 요청을 보내고, 상대가 수락하면 서로의 친구 순위표에 나타난다.
function loadFriendsScreen() {
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
    elements.friendList.innerHTML = '<p class="screen-placeholder">아직 친구가 없습니다. 아이디로 친구를 추가해보세요.</p>';
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
        <span class="card-meta">누적 쌀 소비량</span>
      </span>
      <span class="card-cost">${formatWeight(friend.consumed)}</span>
    `;
    elements.friendList.append(div);
  });
}

if (elements.friendRequestForm) {
  elements.friendRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = getCurrentUser();
    const username = elements.friendUsernameInput.value.trim();
    if (!user || !username) return;

    try {
      const res = await fetch(`${API_BASE_URL}/friends/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester_id: user.id, target_username: username }),
      });
      const payload = await res.json();
      elements.friendRequestMessage.textContent = res.ok ? payload.message : payload.detail || "친구 요청에 실패했습니다.";
      if (res.ok) {
        elements.friendUsernameInput.value = "";
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

function getUpgradeCost(upgrade) {
  return Math.floor(upgrade.baseCost * upgrade.scale ** state.owned[upgrade.id]);
}

function getPopularityBonus() {
  return upgrades.reduce((sum, upgrade) => {
    return sum + state.owned[upgrade.id] * (upgrade.popularityBonus || 0);
  }, 0);
}

function getConsumptionBonus() {
  return upgrades.reduce((sum, upgrade) => {
    return sum + state.owned[upgrade.id] * (upgrade.consumptionBonus || 0);
  }, 0);
}

function getBasePerSecond(targetState = state) {
  return upgrades.reduce((sum, upgrade) => {
    return sum + targetState.owned[upgrade.id] * (upgrade.perSecond || 0);
  }, BASE_PASSIVE_HARVEST);
}

function getPerSecond(targetState = state, options = {}) {
  const base = getBasePerSecond(targetState);
  const permanentMultiplier = 1 + targetState.milestoneAutoBonus + targetState.recipeAutoBonus;
  const hasAutoBuff = !options.ignoreTimedBuffs && Date.now() < targetState.buffs.autoUntil;
  const timedMultiplier = hasAutoBuff ? 1.5 : 1;
  return base * permanentMultiplier * timedMultiplier;
}

function getTapPower() {
  const base = 5 + state.missionTapBonus + upgrades.reduce((sum, upgrade) => {
    return sum + state.owned[upgrade.id] * (upgrade.tapBonus || 0);
  }, 0);
  return Date.now() < state.buffs.clickUntil ? base * 1.5 : base;
}

function getOfflineMultiplier(targetState = state) {
  return 1 + Math.min(targetState.recipeUses.nurungji * 0.05, 0.5);
}

function getUnlockedRecipeCount() {
  return recipes.filter((recipe) => state.popularity >= recipe.unlockPopularity).length;
}

function getLevelProgress() {
  const needed = getXpNeeded(state.level);
  return Math.min((state.xp / needed) * 100, 100);
}

function getXpNeeded(level) {
  return 70 + (level - 1) * 35;
}

function addXp(amount) {
  state.xp += amount;
  while (state.xp >= getXpNeeded(state.level)) {
    state.xp -= getXpNeeded(state.level);
    state.level += 1;
    showToast(`올리 레벨 ${state.level}!`);
    showOllieReaction("./assets/images/characters/ollie_happy.png", 1200);
    showActionEffect("./assets/images/effects/fx_level_up.png", undefined, undefined, "effect-level");
    playGameSound("level");
  }
}

function gainRice(amount) {
  state.rice += amount;
  state.totalHarvested += amount;
}

function spendRice(amount) {
  if (state.rice < amount) return false;
  state.rice -= amount;
  return true;
}

function formatAmount(value) {
  const rounded = Math.floor(value);
  if (rounded < 1000) return `${rounded}`;
  if (rounded < 1000000) return `${(rounded / 1000).toFixed(rounded >= 10000 ? 0 : 1)}K`;
  return `${(rounded / 1000000).toFixed(1)}M`;
}

function formatWeight(value) {
  if (value < 1000) return `${Math.floor(value)}g`;
  const kilograms = value / 1000;
  const decimals = kilograms >= 10 ? 1 : 2;
  return `${kilograms.toFixed(decimals).replace(/\.?0+$/, "")}kg`;
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

function buyUpgrade(upgrade) {
  const cost = getUpgradeCost(upgrade);
  if (!spendRice(cost)) return;
  state.owned[upgrade.id] += 1;
  addXp(4);
  showOllieReaction("./assets/images/characters/ollie_upgrade.png", 1000);
  showActionEffect("./assets/images/effects/fx_sparkle.png", undefined, undefined, "effect-small");
  playGameSound("upgrade");
  showToast(`${upgrade.name} 업그레이드 완료`);
  checkMilestones();
  render();
}

function useRecipe(recipe) {
  if (state.popularity < recipe.unlockPopularity) return;
  if (!spendRice(recipe.cost)) return;

  const unlockedBefore = getUnlockedRecipeCount();
  const consumedGain = recipe.cost * (1 + getConsumptionBonus());
  const popularityGain = Math.ceil(recipe.popularity * (1 + getPopularityBonus()));
  state.consumed += consumedGain;
  state.popularity += popularityGain;
  state.recipeUses[recipe.id] += 1;
  addXp(recipe.xp);

  if (recipe.buff?.type === "click") {
    state.buffs.clickUntil = Date.now() + recipe.buff.duration * 1000;
  }
  if (recipe.buff?.type === "auto") {
    state.buffs.autoUntil = Date.now() + recipe.buff.duration * 1000;
  }
  if (recipe.autoMultiplierBonus) {
    state.recipeAutoBonus += recipe.autoMultiplierBonus;
  }

  showOllieReaction("./assets/images/characters/ollie_happy.png", 1000);
  showActionEffect("./assets/images/effects/fx_consume_complete.png");
  playGameSound("recipe");
  if (getUnlockedRecipeCount() > unlockedBefore) {
    showActionEffect("./assets/images/effects/fx_recipe_unlock.png", undefined, undefined, "effect-unlock");
  }
  showToast(recipe.message);
  checkMilestones();
  render();
}

function claimMission(mission) {
  if (state.claimedMissions[mission.id] || !mission.isComplete()) return;
  state.claimedMissions[mission.id] = true;
  mission.reward();
  addXp(12);
  showActionEffect("./assets/images/effects/fx_sparkle.png", undefined, undefined, "effect-small");
  playGameSound("upgrade");
  showToast(`${mission.name} 완료: ${mission.rewardText}`);
  checkMilestones();
  render();
}

function checkMilestones() {
  for (const milestone of milestones) {
    if (!state.claimedMilestones[milestone.id] && state.consumed >= milestone.amount) {
      state.claimedMilestones[milestone.id] = true;
      milestone.reward();
      showToast(milestone.message);
    }
  }
}

function canHoldFestival() {
  return (
    state.consumed >= FESTIVAL_CONSUMPTION_GOAL &&
    state.popularity >= FESTIVAL_POPULARITY_GOAL &&
    getUnlockedRecipeCount() >= FESTIVAL_RECIPE_GOAL
  );
}

function holdFestival() {
  if (!canHoldFestival()) return;
  state.festivalHeld = true;
  saveState(true);
  render();
  showOllieReaction("./assets/images/characters/ollie_happy.png", 1800);
  showActionEffect("./assets/images/effects/fx_level_up.png", undefined, undefined, "effect-level");
  playGameSound("festival");
  if (elements.festivalDialog.showModal) {
    elements.festivalDialog.showModal();
  } else {
    showToast("작은 쌀 축제 개최!");
  }
}

function renderStats() {
  elements.rice.textContent = formatWeight(state.rice);
  elements.consumed.textContent = formatWeight(state.consumed);
  elements.popularity.textContent = `${Math.floor(state.popularity)}`;
  elements.perSecond.textContent = `${formatWeight(getPerSecond())}/s`;
  elements.tapValue.textContent = `+${formatWeight(getTapPower())}`;
  elements.levelLabel.textContent = `Lv. ${state.level}`;
  elements.xpBar.style.width = `${getLevelProgress()}%`;
  elements.field.dataset.scene = state.festivalHeld ? "festival" : state.consumed >= 10000 ? "village" : "farm";
  elements.soundIcon.src = state.soundEnabled
    ? "./assets/images/ui/ui_sound_on.png"
    : "./assets/images/ui/ui_sound_off.png";
  elements.soundButton.setAttribute("aria-pressed", `${state.soundEnabled}`);
  elements.soundButton.title = state.soundEnabled ? "효과음 켜짐" : "효과음 꺼짐";

  const clickLeft = Math.max(0, Math.ceil((state.buffs.clickUntil - Date.now()) / 1000));
  const autoLeft = Math.max(0, Math.ceil((state.buffs.autoUntil - Date.now()) / 1000));
  const buffs = [];
  if (clickLeft > 0) buffs.push(`김밥 클릭 +50% ${clickLeft}s`);
  if (autoLeft > 0) buffs.push(`떡 자동 +50% ${autoLeft}s`);
  if (state.recipeAutoBonus > 0) buffs.push(`누룽지 자동 +${Math.round(state.recipeAutoBonus * 100)}%`);
  elements.buffSummary.textContent = buffs.length ? buffs.join(" / ") : "효과 없음";

  if (state.festivalHeld) {
    elements.festivalGoal.textContent = "작은 쌀 축제 개최 완료";
    elements.festivalHint.textContent = "다음 확장 목표는 누적 소비량 100kg 지역 대표 쌀 축제입니다.";
    elements.festivalButton.hidden = true;
  } else if (canHoldFestival()) {
    elements.festivalGoal.textContent = "작은 쌀 축제 개최 가능";
    elements.festivalHint.textContent = "올리의 쌀 음식이 모두를 모을 만큼 알려졌어요.";
    elements.festivalButton.hidden = false;
  } else {
    elements.festivalGoal.textContent = "작은 쌀 축제 준비 중";
    elements.festivalHint.textContent = `${formatWeight(state.consumed)} / 30kg, 인기도 ${Math.floor(state.popularity)} / 100, 레시피 ${getUnlockedRecipeCount()} / 5`;
    elements.festivalButton.hidden = true;
  }
}

function renderStages() {
  elements.stageList.innerHTML = "";
  for (const stage of stages) {
    const div = document.createElement("div");
    div.className = `stage${state.consumed >= stage.threshold ? " active" : ""}`;
    div.innerHTML = `<img src="${stage.icon}" alt="" /><span>${stage.name}</span>`;
    elements.stageList.append(div);
  }
}

function renderRecipes() {
  elements.recipeCount.textContent = `${getUnlockedRecipeCount()}/${FESTIVAL_RECIPE_GOAL} 해금`;
  elements.recipeList.innerHTML = "";
  for (const recipe of recipes) {
    const unlocked = state.popularity >= recipe.unlockPopularity;
    const button = document.createElement("button");
    button.className = "game-card";
    button.type = "button";
    button.disabled = !unlocked || state.rice < recipe.cost;
    button.innerHTML = `
      <span class="card-icon"><img src="${recipe.icon}" alt="" /></span>
      <span>
        <span class="card-title">${recipe.name}</span>
        <span class="card-meta">${unlocked ? recipe.note : `인기도 ${recipe.unlockPopularity} 필요`}</span>
        <span class="card-note">사용 ${state.recipeUses[recipe.id]}회</span>
      </span>
      <span class="card-cost">${formatWeight(recipe.cost)}</span>
    `;
    button.addEventListener("click", () => useRecipe(recipe));
    elements.recipeList.append(button);
  }
}

function renderUpgrades() {
  elements.upgradeList.innerHTML = "";
  for (const upgrade of upgrades) {
    const cost = getUpgradeCost(upgrade);
    const button = document.createElement("button");
    button.className = "game-card";
    button.type = "button";
    button.disabled = state.rice < cost;
    button.innerHTML = `
      <span class="card-icon"><img src="${upgrade.icon}" alt="" /></span>
      <span>
        <span class="card-title">${upgrade.name}</span>
        <span class="card-meta">${upgrade.effectText}</span>
        <span class="card-note">${upgrade.type} · 보유 ${state.owned[upgrade.id]}</span>
      </span>
      <span class="card-cost">${formatWeight(cost)}</span>
    `;
    button.addEventListener("click", () => buyUpgrade(upgrade));
    elements.upgradeList.append(button);
  }
}

function renderMissions() {
  elements.missionList.innerHTML = "";
  for (const mission of missions) {
    const done = mission.isComplete();
    const claimed = state.claimedMissions[mission.id];
    const button = document.createElement("button");
    button.className = `game-card${claimed ? " claimed" : ""}`;
    button.type = "button";
    button.disabled = !done || claimed;
    button.innerHTML = `
      <span class="card-icon"><img src="./assets/images/ui/ui_mission.png" alt="" /></span>
      <span>
        <span class="card-title">${mission.name}</span>
        <span class="card-meta">${mission.conditionText}</span>
        <span class="card-note">${mission.rewardText}</span>
      </span>
      <span class="card-cost">${claimed ? "완료" : done ? "받기" : "진행"}</span>
    `;
    button.addEventListener("click", () => claimMission(mission));
    elements.missionList.append(button);
  }
}

function renderMilestones() {
  elements.milestoneList.innerHTML = "";
  for (const milestone of milestones) {
    const progress = Math.min((state.consumed / milestone.amount) * 100, 100);
    const div = document.createElement("div");
    div.className = `milestone${state.claimedMilestones[milestone.id] ? " done" : ""}`;
    div.innerHTML = `
      <strong>${formatWeight(milestone.amount)}</strong>
      <span>${milestone.rewardText}</span>
      <div class="progress-track"><span style="width: ${progress}%"></span></div>
    `;
    elements.milestoneList.append(div);
  }
}

function renderStatsSummary() {
  elements.statsSummary.innerHTML = `
    <div class="stats-item"><span>보유 쌀알</span><strong>${formatWeight(state.rice)}</strong></div>
    <div class="stats-item"><span>누적 쌀 소비량</span><strong>${formatWeight(state.consumed)}</strong></div>
    <div class="stats-item"><span>인기도</span><strong>${Math.floor(state.popularity)}</strong></div>
    <div class="stats-item"><span>레벨</span><strong>Lv. ${state.level}</strong></div>
    <div class="stats-item"><span>경험치</span><strong>${Math.floor(state.xp)} / ${getXpNeeded(state.level)}</strong></div>
  `;
}

function renderStatsUpgrades() {
  elements.statsUpgradeList.innerHTML = "";
  for (const upgrade of upgrades) {
    const div = document.createElement("div");
    div.className = "game-card";
    div.innerHTML = `
      <span class="card-icon"><img src="${upgrade.icon}" alt="" /></span>
      <span>
        <span class="card-title">${upgrade.name}</span>
        <span class="card-meta">${upgrade.effectText}</span>
      </span>
      <span class="card-cost">보유 ${state.owned[upgrade.id]}</span>
    `;
    elements.statsUpgradeList.append(div);
  }
}

function render() {
  renderStats();
  renderStages();
  renderRecipes();
  renderUpgrades();
  renderMissions();
  renderMilestones();
  renderStatsSummary();
  renderStatsUpgrades();
}

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

function resetGame() {
  state = cloneInitialState();
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

elements.harvestButton.addEventListener("click", (event) => {
  const amount = getTapPower();
  gainRice(amount);
  addXp(1);
  const rect = elements.harvestButton.getBoundingClientRect();
  const layerRect = elements.floatLayer.getBoundingClientRect();
  showFloat(
    amount,
    rect.left - layerRect.left + rect.width / 2,
    rect.top - layerRect.top + rect.height / 2,
  );
  playGameSound("click");
  elements.harvestButton.classList.add("harvest-pop");
  setTimeout(() => {
    elements.harvestButton.classList.remove("harvest-pop");
  }, 220);
  checkMilestones();
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
elements.festivalButton.addEventListener("click", holdFestival);
elements.closeFestivalButton.addEventListener("click", () => elements.festivalDialog.close());
window.addEventListener("resize", resizeCanvas);
window.addEventListener("beforeunload", () => saveState(true));

setInterval(() => saveState(true), 15000);

function gameLoop(now) {
  const deltaSeconds = Math.min((now - lastTick) / 1000, 0.25);
  lastTick = now;

  const passiveGain = getPerSecond() * deltaSeconds;
  if (passiveGain > 0) {
    gainRice(passiveGain);
  }

  renderStats();
  if (now - lastFullRender > 300) {
    checkMilestones();
    render();
    lastFullRender = now;
  }
  drawField(now);
  requestAnimationFrame(gameLoop);
}

resizeCanvas();
checkMilestones();
render();
syncFromServer();
requestAnimationFrame(gameLoop);
