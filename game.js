const STORAGE_KEY = "ollies-harvest-save-v1";
const BASE_PASSIVE_HARVEST = 15;
const FESTIVAL_CONSUMPTION_GOAL = 30000;
const FESTIVAL_POPULARITY_GOAL = 100;
const FESTIVAL_RECIPE_GOAL = 5;

const stages = [
  { name: "모내기", threshold: 0 },
  { name: "벼 성장", threshold: 500 },
  { name: "수확", threshold: 1500 },
  { name: "도정", threshold: 4000 },
  { name: "밥 짓기", threshold: 8000 },
  { name: "레시피 개발", threshold: 15000 },
  { name: "작은 쌀 축제", threshold: FESTIVAL_CONSUMPTION_GOAL },
];

const upgrades = [
  {
    id: "seed",
    name: "좋은 볍씨",
    icon: "씨",
    baseCost: 25,
    scale: 1.15,
    type: "생산",
    effectText: "초당 수확 +1g",
    perSecond: 1,
  },
  {
    id: "water",
    name: "자동 물대기",
    icon: "물",
    baseCost: 100,
    scale: 1.17,
    type: "생산",
    effectText: "초당 수확 +5g",
    perSecond: 5,
  },
  {
    id: "helper",
    name: "수확 도우미",
    icon: "손",
    baseCost: 450,
    scale: 1.18,
    type: "생산",
    effectText: "초당 수확 +20g",
    perSecond: 20,
  },
  {
    id: "sickle",
    name: "튼튼한 낫",
    icon: "낫",
    baseCost: 80,
    scale: 1.2,
    type: "클릭",
    effectText: "클릭 수확 +3g",
    tapBonus: 3,
  },
  {
    id: "cooker",
    name: "밥솥 업그레이드",
    icon: "솥",
    baseCost: 300,
    scale: 1.22,
    type: "소비",
    effectText: "레시피 인기도 +10%",
    popularityBonus: 0.1,
  },
  {
    id: "package",
    name: "포장 아이디어",
    icon: "상",
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
    icon: "밥",
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
    icon: "김",
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
    icon: "떡",
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
    icon: "빵",
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
    icon: "누",
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

const elements = {
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
  festivalGoal: document.querySelector("#festivalGoal"),
  festivalHint: document.querySelector("#festivalHint"),
  festivalButton: document.querySelector("#festivalButton"),
  buffSummary: document.querySelector("#buffSummary"),
  harvestButton: document.querySelector("#harvestButton"),
  ollieImage: document.querySelector("#ollieImage"),
  floatLayer: document.querySelector("#floatLayer"),
  saveButton: document.querySelector("#saveButton"),
  resetButton: document.querySelector("#resetButton"),
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

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return cloneInitialState();

  try {
    const saved = JSON.parse(raw);
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
      setTimeout(() => showToast(`쉬는 동안 올리가 +${formatAmount(offlineGain)} 쌀알을 수확했어요.`), 300);
    }
    return merged;
  } catch {
    return cloneInitialState();
  }
}

function saveState(silent = false) {
  state.lastSavedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2).replace(/\.0$/, "")}kg`;
}

function buyUpgrade(upgrade) {
  const cost = getUpgradeCost(upgrade);
  if (!spendRice(cost)) return;
  state.owned[upgrade.id] += 1;
  addXp(4);
  showToast(`${upgrade.name} 업그레이드 완료`);
  checkMilestones();
  render();
}

function useRecipe(recipe) {
  if (state.popularity < recipe.unlockPopularity) return;
  if (!spendRice(recipe.cost)) return;

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

  showToast(recipe.message);
  checkMilestones();
  render();
}

function claimMission(mission) {
  if (state.claimedMissions[mission.id] || !mission.isComplete()) return;
  state.claimedMissions[mission.id] = true;
  mission.reward();
  addXp(12);
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
  if (elements.festivalDialog.showModal) {
    elements.festivalDialog.showModal();
  } else {
    showToast("작은 쌀 축제 개최!");
  }
}

function renderStats() {
  elements.rice.textContent = formatAmount(state.rice);
  elements.consumed.textContent = formatWeight(state.consumed);
  elements.popularity.textContent = `${Math.floor(state.popularity)}`;
  elements.perSecond.textContent = `${formatAmount(getPerSecond())}g/s`;
  elements.tapValue.textContent = `+${formatAmount(getTapPower())}g`;
  elements.levelLabel.textContent = `Lv. ${state.level}`;
  elements.xpBar.style.width = `${getLevelProgress()}%`;

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
    div.textContent = stage.name;
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
      <span class="card-icon">${recipe.icon}</span>
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
      <span class="card-icon">${upgrade.icon}</span>
      <span>
        <span class="card-title">${upgrade.name}</span>
        <span class="card-meta">${upgrade.effectText}</span>
        <span class="card-note">${upgrade.type} · 보유 ${state.owned[upgrade.id]}</span>
      </span>
      <span class="card-cost">${formatAmount(cost)}</span>
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
      <span class="card-icon">${claimed ? "완" : done ? "!" : "목"}</span>
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

function render() {
  renderStats();
  renderStages();
  renderRecipes();
  renderUpgrades();
  renderMissions();
  renderMilestones();
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

function showFloat(amount, x, y) {
  const text = document.createElement("span");
  text.className = "float-text";
  text.textContent = `+${formatAmount(amount)} 쌀알`;
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  showFloat(amount, rect.left + rect.width / 2, rect.top + rect.height / 2);
  elements.harvestButton.classList.add("harvest-pop");
  setTimeout(() => {
    elements.harvestButton.classList.remove("harvest-pop");
  }, 220);
  checkMilestones();
  render();
});

elements.saveButton.addEventListener("click", () => saveState(false));
elements.resetButton.addEventListener("click", resetGame);
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
requestAnimationFrame(gameLoop);
