// 의존성 없이 실행: node --test tests/game.test.cjs
// 실제 game.js를 VM에서 실행합니다. DOM/시계/네트워크만 대체합니다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const configSource = fs.readFileSync(path.join(root, 'frontend/js/balance-config.js'), 'utf8');
const gameSource = fs.readFileSync(path.join(root, 'frontend/game.js'), 'utf8').split('// 이벤트 바인딩')[0];

function createGame(enabled = true) {
  let now = 1780000000000;
  let timerId = 0;
  const timers = new Map();
  const stored = new Map();
  const requests = [];
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  class Element {
    constructor() {
      this.children = []; this.dataset = {}; this.style = {}; this.events = {};
      this.hidden = true; this.value = ''; this.scrollLeft = 0; this.clientWidth = 700;
      this.offsetTop = 400; this.className = ''; this.attributes = {}; this._html = '';
      this.classList = {
        add: (s) => { this.className += ` ${s}`; },
        remove: (s) => { this.className = this.className.split(' ').filter(x => x !== s).join(' '); },
        toggle: () => {},
      };
    }
    set innerHTML(value) { this._html = value; this.children = []; }
    get innerHTML() { return this._html; }
    get lastElementChild() { return this.children.at(-1); }
    addEventListener(name, fn) { (this.events[name] ??= []).push(fn); }
    emit(name, event = {}) { for (const fn of this.events[name] || []) fn({ preventDefault() {}, ...event }); }
    append(child) { this.children.push(child); }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return name === 'src' ? (this.src ?? null) : (this.attributes[name] ?? null); }
    getContext() { return {}; }
    focus() { this.focused = true; }
    querySelectorAll() { return []; }
    querySelector(selector) { return this.children.find(x => x.className.split(' ').includes(selector.slice(1))) || null; }
    setPointerCapture(id) { this.pointerCapture = id; }
    getBoundingClientRect() { return { left: 0, width: this.clientWidth }; }
  }
  const nodes = new Map();
  const node = selector => { if (!nodes.has(selector)) nodes.set(selector, new Element()); return nodes.get(selector); };
  const sandbox = {
    assert, Date: FakeDate, console,
    performance: { now: () => now },
    document: { querySelector: node, createElement: () => new Element() },
    localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
    fetch: (url, options) => { requests.push({ url, options }); return Promise.resolve({ ok: true }); },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, due: now + delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    window: { addEventListener() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(enabled ? configSource : configSource.replace('const ADMIN_MODE_ENABLED = true;', 'const ADMIN_MODE_ENABLED = false;'), sandbox);
  vm.runInContext(gameSource, sandbox);
  const run = code => vm.runInContext(code, sandbox);
  run(`
    render = renderUpgrades = renderRecipes = renderStatsSummary = () => {};
    showToast = showOllieReaction = showActionEffect = playGameSound = () => {};
    function resetReady() {
      state = cloneInitialState();
      state.rice = 1e9;
      state.consumed = 1e6;
      state.level = getGameLevelByConsumed(state.consumed).level;
      for (const m of milestones) state.claimedMilestones[m.id] = true;
      selectedRecipeQty = 1;
    }
    function recipe(id) { return RECIPES.find(r => r.id === id); }
  `);
  return {
    run, node, stored, requests,
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.due <= now) { timers.delete(id); timer.fn(); }
      }
    },
  };
}

test('original five recipes retain costs (11 total), quantities and consumed-based game LV thresholds', () => {
  createGame().run(`
    assert.equal(RECIPES.length, 11);
    assert.equal(JSON.stringify(RECIPES.slice(0, 5).map(r => r.cost)), '[150,120,250,300,200]');
    assert.equal(new Set(RECIPES.map(r => r.id)).size, 11);
    for (let i = 1; i < RECIPES.length; i++) assert.ok(RECIPES[i].unlockConsumed >= RECIPES[i - 1].unlockConsumed);
    assert.equal(JSON.stringify(RECIPE_QUANTITY_OPTIONS), '[1,10,100,"MAX"]');
    assert.equal(GAME_LEVELS.length, 12);
    assert.equal(getGameLevelByConsumed(999).level, 1);
    assert.equal(getGameLevelByConsumed(1000).level, 2);
    assert.equal(getGameLevelByConsumed(1600000000000).level, 12);
    assert.ok(DAILY_MISSIONS.every(m => m.reward.type === 'booster'));
  `);
});

test('each timed recipe accumulates time for ×1/×10/×100, never its multiplier', () => {
  for (const [id, seconds, multiplier, type] of [['kimbap', 30, 3, 'click'], ['tteok', 30, 3, 'auto'], ['nurungji', 45, 2, 'all']]) {
    const g = createGame();
    g.run(`resetReady(); useRecipe(recipe('${id}'));`);
    g.advance(5000);
    g.run(`
      selectedRecipeQty = 10; useRecipe(recipe('${id}'));
      selectedRecipeQty = 100; useRecipe(recipe('${id}'));
      assert.equal(state.buffs.${type}Until - Date.now(), ${seconds} * 111000 - 5000);
      assert.equal(state.buffs.${type}Multiplier, ${multiplier});
      assert.equal(state.recipeUses.${id}, 111);
      assert.equal(state.dailyProgress.recipe, 3);
      assert.equal(state.consumed, 1e6 + recipe('${id}').cost * 111);
    `);
  }
});

test('expired recipe restarts from now; click/auto/all buffs combine and expire independently', () => {
  const g = createGame();
  g.run(`resetReady(); useRecipe(recipe('kimbap')); useRecipe(recipe('tteok')); useRecipe(recipe('nurungji'));
    assert.equal(getTapPower(), 6); assert.equal(getPerSecond(), 6);`);
  g.advance(31000);
  g.run(`assert.equal(getTapPower(), 2); assert.equal(getPerSecond(), 2);
    useRecipe(recipe('kimbap')); assert.equal(state.buffs.clickUntil - Date.now(), 30000);`);
  g.advance(31000);
  g.run(`assert.equal(getTapPower(), 1); assert.equal(getPerSecond(), 1);`);
});

test('MAX spends all affordable units exactly once and leaves less than one recipe cost', () => {
  const g = createGame();
  for (const id of ['meal', 'kimbap', 'tteok', 'bread', 'nurungji']) {
    g.run(`resetReady(); state.rice = recipe('${id}').cost * 123456 + 17.5;
      selectedRecipeQty = 'MAX'; useRecipe(recipe('${id}'));
      assert.equal(state.rice, 17.5); assert.equal(state.recipeUses.${id}, 123456);
      assert.equal(state.consumed, 1e6 + recipe('${id}').cost * 123456);
      var snapshot = JSON.stringify(state); useRecipe(recipe('${id}'));
      assert.equal(JSON.stringify(state), snapshot);`);
  }
});

test('locked recipe and unaffordable fixed quantity leave all game data unchanged', () => {
  createGame().run(`state = cloneInitialState(); state.rice = 1e6;
    let before = JSON.stringify(state); useRecipe(recipe('bread')); assert.equal(JSON.stringify(state), before);
    state.rice = 149; before = JSON.stringify(state); useRecipe(recipe('meal')); assert.equal(JSON.stringify(state), before);
    state.rice = 1499; selectedRecipeQty = 10; before = JSON.stringify(state);
    useRecipe(recipe('meal')); assert.equal(JSON.stringify(state), before);`);
});

test('rice meal bonus is quantity-scaled and consumed only by the next booster', () => {
  createGame().run(`resetReady(); selectedRecipeQty = 10; useRecipe(recipe('meal'));
    assert.equal(state.boosterDurationBonusSeconds, 600);
    useBooster(); assert.equal(state.boosterDurationBonusSeconds, 600);
    state.boosterCount = 2; state.permanentBoosterDurationSeconds = 10;
    useBooster(); assert.equal(state.boosterEndTime - Date.now(), 670000);
    assert.equal(state.boosterDurationBonusSeconds, 0);
    useBooster(); assert.equal(state.boosterEndTime - Date.now(), 740000);
    assert.equal(getBoosterMultiplier(), 2);`);
});

test('bread grants one fixed bonus per charge, with no unlimited multiplier stacking', () => {
  const g = createGame();
  g.run(`resetReady(); selectedRecipeQty = 10; useRecipe(recipe('bread'));
    assert.equal(state.boosterMultiplierCharges, 10);
    state.boosterCount = 12;
    for (let i = 0; i < 10; i++) useBooster();
    assert.equal(getBoosterMultiplier(), 2.5); assert.equal(state.boosterMultiplierCharges, 0);
    assert.equal(state.boosterEndTime - Date.now(), 600000);`);
  g.advance(600001);
  g.run(`useBooster(); assert.equal(getBoosterMultiplier(), 2);
    selectedRecipeQty = 1; useRecipe(recipe('bread')); state.boosterMultiplierBonus = 0.2;
    useBooster(); assert.equal(getBoosterMultiplier(), 2.9);`);
});

test('20 milestone goals, bulk claims and repeat checks are idempotent', () => {
  createGame().run(`state = cloneInitialState();
    assert.equal(JSON.stringify(milestones.map(m => m.amount / 1000)),
      '[1,5,10,20,50,100,250,500,1000,2500,5000,10000,25000,50000,100000,250000,500000,1000000,2500000,5000000]');
    state.consumed = 5e9; checkMilestones();
    assert.equal(milestones.filter(m => state.claimedMilestones[m.id]).length, 20);
    assert.equal(state.boosterCount, 38);
    assert.equal(state.rice, 101000);
    assert.equal(state.permanentBoosterDurationSeconds, 30);
    assert.equal(state.unlockFlags.harvestCrown, true);
    assert.equal(state.level, 1); // 마일스톤 처리 자체가 LV를 변경하면 안 됨
    const before = JSON.stringify(state); checkMilestones(); assert.equal(JSON.stringify(state), before);`);
});

test('attendance rewards pay out rice/boosters for days 1-7 with no popularity field, and stop advancing after day 7', () => {
  const g = createGame();
  g.run(`
    state = cloneInitialState();
    checkAttendanceProgress('2026-01-01'); assert.equal(state.attendance.count, 1);
    checkAttendanceProgress('2026-01-01'); assert.equal(state.attendance.count, 1); // 같은 날 중복 인정 방지
    claimAttendanceReward(1); assert.equal(state.rice, 30);
    checkAttendanceProgress('2026-01-02'); claimAttendanceReward(2); assert.equal(state.rice, 110);
    checkAttendanceProgress('2026-01-03'); claimAttendanceReward(3); assert.equal(state.boosterCount, 1);
    checkAttendanceProgress('2026-01-04'); claimAttendanceReward(4); assert.equal(state.rice, 230);
    checkAttendanceProgress('2026-01-05'); claimAttendanceReward(5); assert.equal(state.rice, 430);
    checkAttendanceProgress('2026-01-06'); claimAttendanceReward(6); assert.equal(state.boosterCount, 3);
    checkAttendanceProgress('2026-01-07'); claimAttendanceReward(7);
    assert.equal(state.boosterCount, 6); assert.equal(state.rice, 930);
    assert.ok(!('popularity' in state)); // 인기도 시스템 폐지: 출석 보상이 되살리지 않아야 함
    checkAttendanceProgress('2026-01-08'); assert.equal(state.attendance.count, 7); // 7일 완료 후 더 증가하지 않음
    claimAttendanceReward(7); assert.equal(state.rice, 930); // 중복 수령 방지
  `);
});

test('old saves retain unlocked recipes, rewards and accumulated booster time', () => {
  createGame().run(`const legacy = cloneInitialState();
    legacy.popularity = 70; legacy.consumed = 20000; legacy.rice = 42;
    legacy.claimedMilestones = { m1: true, m5: true, m10: true, m20: true, m30: true };
    legacy.milestoneAutoBonus = 0.1; legacy.boosterDurationBonusSeconds = 180;
    delete legacy.boosterMultiplierCharges; delete legacy.activeBoosterRecipeBonus;
    delete legacy.permanentBoosterDurationSeconds;
    state = normalizeState(legacy); checkMilestones();
    assert.ok(!('popularity' in state)); assert.equal(state.rice, 42);
    assert.equal(state.boosterCount, 0); assert.equal(state.milestoneAutoBonus, 0.1);
    const legacyFive = () => RECIPES.slice(0, 5).every(r => isRecipeUnlocked(r));
    assert.equal(state.boosterDurationBonusSeconds, 180); assert.ok(legacyFive());
    state.consumed = 0; assert.ok(legacyFive()); assert.equal(getUnlockedRecipeCount(), 5); // 신규 레시피는 소비량으로만 열림
    state = normalizeState(JSON.parse(JSON.stringify(state))); assert.ok(legacyFive());
    assert.equal(state.order.status, 'none'); assert.deepEqual(state.feastsDone, {}); assert.equal(state.offlineBonus, 0);
    assert.equal(state.boosterMultiplierCharges, 0);`);
});

test('admin grants only wallet rice, saves locally and submits the same JSON to server', () => {
  const g = createGame();
  g.stored.set('currentUser', JSON.stringify({ id: 19 }));
  g.run(`state = cloneInitialState(); state.rice = 20000;
    const before = JSON.parse(JSON.stringify(state));
    assert.equal(addAdminRice('100', 'kg'), true); assert.equal(state.rice, 120000);
    const after = JSON.parse(JSON.stringify(state)); delete before.rice; delete after.rice;
    delete before.lastSavedAt; delete after.lastSavedAt;
    assert.deepEqual(after, before);
    assert.equal(getTapPower(), 1); assert.equal(getPerSecond(), 1);`);
  const saved = JSON.parse(g.stored.get('ollies-harvest-save-v2:19'));
  assert.equal(saved.rice, 120000);
  assert.equal(saved.consumed, 0);
  assert.equal(g.requests.at(-1).options.method, 'PUT');
  assert.deepEqual(JSON.parse(g.requests.at(-1).options.body).data, saved);
  g.run(`selectedRecipeQty = 'MAX'; useRecipe(recipe('meal'));
    assert.equal(state.consumed, 120000); assert.equal(state.level, 4);
    assert.equal(state.claimedMilestones.m100, true);`);
});

test('admin rejects empty, zero, negatives, decimals, exponents, non-digits, overflow and invalid units', () => {
  const g = createGame();
  for (const input of ['', ' ', '0', '-1', '1.5', '1e6', 'NaN', 'Infinity', '100kg', '1,000', '９', '9'.repeat(400), '1000000000001']) {
    g.run('state = cloneInitialState();');
    g.run(`assert.equal(addAdminRice(${JSON.stringify(input)}, 'g'), false); assert.equal(state.rice, 0);`);
  }
  g.run(`assert.equal(addAdminRice('10', 'bad'), false);
    state.rice = ADMIN_CONFIG.maxRiceBalance; assert.equal(addAdminRice('1', 'g'), false);
    state.rice = 0; assert.equal(addAdminRice('1', 'g'), true);
    assert.equal(addAdminRice('1', 't'), true); assert.equal(state.rice, 1000001);`);
});

test('admin disabled flag blocks both setup and direct grant', () => {
  const g = createGame(false);
  g.run(`assert.equal(addAdminRice('100'), false); assert.equal(state.rice, 0); setupAdminMode();`);
  assert.equal(g.node('#adminModeTrigger').events.click, undefined);
});

test('admin opens at five clicks within three seconds, timeout resets, close preserves state', () => {
  const g = createGame();
  g.run('setupAdminMode();');
  const trigger = g.node('#adminModeTrigger');
  const panel = g.node('#adminPanel');
  for (let i = 0; i < 4; i++) trigger.emit('click');
  assert.equal(panel.hidden, true);
  g.advance(3000);
  trigger.emit('click');
  assert.equal(panel.hidden, true);
  g.advance(2900);
  for (let i = 0; i < 4; i++) trigger.emit('click');
  assert.equal(panel.hidden, false);
  const before = g.run('JSON.stringify(state)');
  g.node('#closeAdminButton').emit('click');
  assert.equal(panel.hidden, true);
  assert.equal(g.run('JSON.stringify(state)'), before);
});

test('milestone render retains card nodes and drag offset through repeated game renders', () => {
  const g = createGame();
  g.run('state = cloneInitialState(); state.consumed = 125000; checkMilestones(); renderMilestones(); setupMilestoneDrag();');
  const list = g.node('#milestoneList');
  assert.equal(list.children.length, 20);
  assert.match(list.children[6].className, /current/);
  assert.match(list.children[6].innerHTML, /125kg \/ 250kg/);
  assert.match(list.children[6].innerHTML, /aria-valuenow="50"/);
  const first = list.children[0];
  list.emit('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 300 });
  list.emit('pointermove', { pointerId: 1, clientX: 100 });
  g.run('renderMilestones();');
  assert.equal(list.scrollLeft, 200);
  assert.equal(list.children[0], first);
  list.emit('pointercancel');
  list.emit('pointermove', { pointerId: 1, clientX: 0 });
  assert.equal(list.scrollLeft, 200);
  list.emit('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 100 });
  list.emit('pointermove', { pointerId: 2, clientX: 0 });
  assert.equal(list.scrollLeft, 200); // 터치는 JS로 가로채지 않고 브라우저에 맡김
});

test('saved buffs and queues reload, offline production ignores timed buffs, reset clears additions', () => {
  const g = createGame();
  g.run(`resetReady(); selectedRecipeQty = 10; useRecipe(recipe('meal')); useRecipe(recipe('bread'));
    useRecipe(recipe('tteok')); state.boosterCount = 1; useBooster(); saveState(true);
    state = loadState(); assert.equal(state.boosterMultiplierCharges, 9);
    assert.equal(state.activeBoosterRecipeBonus, 0.5); assert.equal(getPerSecond(), 7.5);
    assert.equal(getPerSecond(state, {ignoreTimedBuffs: true}), 1);`);
  g.advance(10000);
  g.run(`const saved = JSON.parse(localStorage.getItem(getStorageKey()));
    state = normalizeState(saved); assert.equal(state.rice, saved.rice + 10);
    resetGame(); assert.equal(state.consumed, 0); assert.equal(state.boosterMultiplierCharges, 0);
    assert.equal(state.activeBoosterRecipeBonus, 0); assert.equal(state.permanentBoosterDurationSeconds, 0);`);
});

test('reward lists keep the same button nodes across repeated renders so presses are not dropped', () => {
  const g = createGame();
  g.run(`state = cloneInitialState(); state.attendance.count = 7; state.dailyProgress.click = 30;
    renderAttendance(); renderMissions();`);
  for (const selector of ['#attendanceList', '#missionList', '#missionDialogList']) {
    const list = g.node(selector);
    const first = list.children[0];
    g.run('renderAttendance(); renderMissions();'); // 게임 루프의 300ms 주기 렌더링
    assert.equal(list.children[0], first, `${selector} button must not be replaced`);
    assert.equal(first.disabled, false);
  }
  g.node('#attendanceList').children[0].emit('click');
  g.node('#missionDialogList').children[0].emit('click');
  g.run(`assert.equal(state.attendance.claimedDays[1], true); assert.equal(state.rice, 30);
    assert.equal(state.dailyClaimed.dailyClick, true); assert.equal(state.boosterCount, 1);
    renderAttendance(); renderMissions();`);
  assert.equal(g.node('#attendanceList').children[0].disabled, true);
  assert.equal(g.node('#missionList').children[0].disabled, true);
});

test('random event: ready -> start -> complete -> reward makes rice x1.5, then cooldown picks a different event', () => {
  const g = createGame();
  g.run(`state = cloneInitialState(); checkEventState();
    assert.equal(state.event.status, 'ready'); assert.ok(getEventDef(state.event.id));
    state.event = { id: 'useFertilizer', status: 'ready', progress: 0, startedAt: 0, nextAt: 0 };
    state.boosterCount = 1; useBooster(); assert.equal(state.event.progress, 0); // 시작 전 행동은 집계 안 함
    advanceEvent('boosterUse'); assert.equal(state.event.status, 'ready');
    startEvent(); assert.equal(state.event.status, 'active');
    advanceEvent('click'); assert.equal(state.event.progress, 0); // 다른 종류 행동은 무시
    state.boosterCount = 1; useBooster(); assert.equal(state.event.status, 'complete');
    state.rice = 10000; claimEventReward(); assert.equal(state.rice, 15000);
    assert.equal(state.event.status, 'claimed'); claimEventReward(); assert.equal(state.rice, 15000); // 중복 수령 방지
    checkEventState(); assert.equal(state.event.status, 'claimed');`);
  g.advance(g.run('EVENT_CONFIG.cooldownSeconds * 1000'));
  g.run(`checkEventState(); assert.equal(state.event.status, 'ready'); assert.notEqual(state.event.id, 'useFertilizer');`);
});

test('timed click event fails after its limit, can be retried, and small balances get the minimum reward', () => {
  const g = createGame();
  g.run(`state = cloneInitialState();
    state.event = { id: 'clickRush', status: 'ready', progress: 0, startedAt: 0, nextAt: 0 };
    startEvent(); for (let i = 0; i < 19; i++) advanceEvent('click');
    assert.equal(state.event.progress, 19);`);
  g.advance(61000);
  g.run(`advanceEvent('click'); assert.equal(state.event.status, 'failed');
    startEvent(); assert.equal(state.event.status, 'active'); assert.equal(state.event.progress, 0);
    for (let i = 0; i < 20; i++) advanceEvent('click'); assert.equal(state.event.status, 'complete');
    state.rice = 10; claimEventReward(); assert.equal(state.rice, 10 + EVENT_CONFIG.minRewardRice);`);
});

test('event skip only works before starting or after failing; old saves without event data get a new event', () => {
  createGame().run(`state = cloneInitialState();
    state.event = { id: 'toolCare', status: 'ready', progress: 0, startedAt: 0, nextAt: 0 };
    skipEvent(); assert.notEqual(state.event.id, 'toolCare'); assert.equal(state.event.status, 'ready');
    startEvent(); const id = state.event.id; skipEvent(); assert.equal(state.event.id, id); // 진행 중엔 바꿀 수 없음
    const legacy = cloneInitialState(); delete legacy.event;
    state = normalizeState(legacy); assert.equal(state.event.status, 'none');
    checkEventState(); assert.equal(state.event.status, 'ready');`);
});

test('daily phrase is random per visit, never repeats the previous visit, and stays fixed during a visit', () => {
  createGame().run(`
    for (let exclude = 0; exclude < DAILY_PHRASES.length; exclude++) {
      for (let i = 0; i < 40; i++) {
        const index = pickRandomPhraseIndex(exclude);
        assert.ok(index >= 0 && index < DAILY_PHRASES.length);
        assert.notEqual(index, exclude);
      }
    }
    const seen = new Set(); for (let i = 0; i < 2000; i++) seen.add(pickRandomPhraseIndex(-1));
    assert.equal(seen.size, DAILY_PHRASES.length); // 제외 없을 때 모든 문구가 나올 수 있음
    assert.ok(Number.isInteger(pickRandomPhraseIndex(NaN)));
    assert.equal(localStorage.getItem('ollies-harvest-last-phrase'), String(DAILY_PHRASES.indexOf(sessionPhrase)));
  `);
  // 한 번 접속한 동안에는 반복 렌더링(300ms 주기)에도 문구가 바뀌지 않아야 함
  for (let i = 0; i < 20; i++) {
    const g = createGame();
    const first = g.run('sessionPhrase');
    g.run(`renderDailyPhrase(); renderDailyPhrase();`);
    assert.equal(g.node('#dailyPhraseText').textContent, first);
  }
});

test('rice display flows up to click/reward gains, keeps up with passive gain, and drops instantly when spending', () => {
  const g = createGame();
  const frames = (ms) => { const out = []; for (let t = 0; t < ms; t += 16) { g.advance(16); out.push(g.run('getDisplayedRice()')); } return out; };
  g.run(`state = cloneInitialState(); state.rice = 3100; stopRiceTween();
    gainRice(200);                                   // 클릭·보상: 실제 값은 즉시, 표시는 흐르듯
    assert.equal(state.rice, 3300); assert.equal(getDisplayedRice(), 3100);`);
  const seen = frames(640);                          // 60fps로 약 0.64초
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], 'display must only go up');
  assert.ok(seen[0] > 3100 && seen[0] < 3150, `first frame should move only a little, got ${seen[0]}`);
  assert.ok(seen.some(v => v > 3150 && v < 3250), 'should pass through 3.2kg on the way');
  assert.equal(seen.at(-1), 3300);                   // 끝나면 정확히 실제 값

  // 화면이 멈췄다(프레임 드랍) 다시 그려져도 앞부분을 건너뛰지 않음
  g.run(`state.rice = 3100; stopRiceTween(); gainRice(200);`);
  g.advance(300);
  const afterStall = g.run('getDisplayedRice()');
  assert.ok(afterStall < 3200, `stall must not skip ahead, got ${afterStall}`);
  frames(700);

  g.run(`gainRice(500); gainRice(500);               // 연속 증가: 남은 양에 더해짐
    assert.equal(state.rice, 4300); assert.equal(getDisplayedRice(), 3300);`);
  frames(300);
  g.run(`assert.ok(getDisplayedRice() > 3300 && getDisplayedRice() < 4300);
    spendRice(1000); assert.equal(getDisplayedRice(), state.rice); // 소비는 즉시 반영
    gainRice(5, { instant: true }); assert.equal(getDisplayedRice(), state.rice); // 자동 수확은 즉시
    renderStats(); assert.equal(elements.rice.textContent, formatRiceAmount(state.rice));`);
});

test('rice amount always shows two decimals (kg and above), rounds down, and keeps a constant length while rising', () => {
  createGame().run(`
    assert.equal(formatRiceAmount(450), '450g');
    assert.equal(formatRiceAmount(1000), '1.00kg');
    assert.equal(formatRiceAmount(3100), '3.10kg');
    assert.equal(formatRiceAmount(3200), '3.20kg');
    assert.equal(formatRiceAmount(3300), '3.30kg');
    assert.equal(formatRiceAmount(3219.99), '3.21kg'); // 내림: 보유량보다 크게 보이지 않음
    assert.equal(formatRiceAmount(49300), '49.30kg');
    assert.equal(formatRiceAmount(123456), '123.45kg');
    assert.equal(formatRiceAmount(999999), '999.99kg'); // 반올림으로 1000.00kg이 되지 않음
    assert.equal(formatRiceAmount(1000000), '1.00t');
    assert.equal(formatRiceAmount(123456789), '123.45t');
    const lengths = new Set(); for (let v = 3100; v <= 9990; v += 7) lengths.add(formatRiceAmount(v).length);
    assert.equal(lengths.size, 1);
  `);
});

test('new recipes: jumeokbap crit, sikhye offline bonus (capped), ssalgwaja extra consumption', () => {
  const g = createGame();
  g.run(`resetReady(); state.consumed = 1e9; // 모두 해금
    useRecipe(recipe('jumeokbap'));
    assert.equal(state.buffs.critUntil - Date.now(), 60000);
    const base = getTapPower();
    assert.equal(rollHarvestAmount(() => 0.05).amount, base * 10); assert.equal(rollHarvestAmount(() => 0.05).crit, true);
    assert.equal(rollHarvestAmount(() => 0.5).amount, base); assert.equal(rollHarvestAmount(() => 0.5).crit, false);`);
  g.advance(60001);
  g.run(`assert.equal(rollHarvestAmount(() => 0).crit, false); // 버프 끝나면 대박 없음
    selectedRecipeQty = 10; useRecipe(recipe('sikhye')); assert.ok(Math.abs(state.offlineBonus - 0.5) < 1e-9);
    selectedRecipeQty = 100; useRecipe(recipe('sikhye')); assert.equal(state.offlineBonus, OFFLINE_BONUS_MAX);
    const before = { rice: state.rice, consumed: state.consumed };
    selectedRecipeQty = 1; useRecipe(recipe('ssalgwaja'));
    assert.equal(before.rice - state.rice, 20000);          // 쌀알은 쓴 만큼만 줄고
    assert.equal(state.consumed - before.consumed, 30000);  // 소비량은 1.5배 인정`);
  // 식혜 보너스는 오프라인 수확에 반영
  g.run(`state = cloneInitialState(); state.offlineBonus = 1; saveState(true);`);
  g.advance(10000);
  g.run(`const saved = JSON.parse(localStorage.getItem(getStorageKey())); const loaded = normalizeState(saved);
    assert.equal(loaded.rice - saved.rice, 20); // 1g/s × 10초 × (1 + 100%)`);
});

test('new recipes: tteokguk doubles next LV reward (capped by remaining levels), bibimbap extends active buffs, ssalguksu daily booster cap', () => {
  const g = createGame();
  g.run(`state = cloneInitialState(); state.rice = 1e12; state.consumed = 125000; checkGameLevelUp();
    for (const m of milestones) state.claimedMilestones[m.id] = true; // 마일스톤 보상 제외하고 LV 보상만 확인
    assert.equal(state.level, 5);
    state.consumed = 2500000; // 떡국 해금 (LV 판정은 아래에서 다시)
    state.level = 5;
    useRecipe(recipe('tteokguk'));                   // 이 소비로 LV.6 도달 → LV.6 보상이 2배
    assert.equal(state.level, 6);
    assert.ok(Math.abs(state.permanentBonus.click - 0.1) < 1e-9); // LV.6 클릭 영구 +5% × 2
    assert.equal(state.levelRewardDoubleCharges, 0);
    selectedRecipeQty = 100; useRecipe(recipe('tteokguk'));
    assert.equal(state.levelRewardDoubleCharges, getRemainingLevelCount()); // 남은 LV 수까지만 적립
    selectedRecipeQty = 1;`);
  g.run(`state.consumed = 1e9; useRecipe(recipe('kimbap')); const kimbapEnd = state.buffs.clickUntil;
    const autoEnd = state.buffs.autoUntil; // 꺼져 있음
    selectedRecipeQty = 2; useRecipe(recipe('bibimbap'));
    assert.equal(state.buffs.clickUntil - kimbapEnd, 60000); // 켜진 버프만 +30초×2
    assert.equal(state.buffs.autoUntil, autoEnd);            // 꺼진 버프는 그대로
    selectedRecipeQty = 3; const b0 = state.boosterCount; useRecipe(recipe('ssalguksu'));
    assert.equal(state.boosterCount - b0, 3);
    selectedRecipeQty = 10; useRecipe(recipe('ssalguksu'));
    assert.equal(state.boosterCount - b0, 5);                // 하루 최대 5개
    assert.equal(state.dailyProgress.noodleBooster, 5);
    state.dailyDateKey = '2000-01-01'; checkDailyAndWeeklyReset();
    selectedRecipeQty = 1; useRecipe(recipe('ssalguksu')); assert.equal(state.boosterCount - b0, 6); // 다음 날 다시`);
});

test('feasts open in order once each, consume rice and grant permanent rewards', () => {
  createGame().run(`state = cloneInitialState(); state.rice = 1e11;
    for (const m of milestones) state.claimedMilestones[m.id] = true; // 마일스톤 보상 제외하고 잔치만 확인
    assert.equal(getFeastStatus(FEASTS[0]), 'open'); assert.equal(getFeastStatus(FEASTS[1]), 'locked');
    holdFeast(FEASTS[1]); assert.equal(state.rice, 1e11); // 잠긴 잔치는 열 수 없음
    holdFeast(FEASTS[0]);
    assert.equal(state.rice, 1e11 - 30000); assert.equal(state.consumed, 30000);
    assert.ok(Math.abs(state.permanentBonus.all - 0.05) < 1e-9); assert.equal(getFeastStatus(FEASTS[0]), 'done');
    const snapshot = JSON.stringify(state); holdFeast(FEASTS[0]); assert.equal(JSON.stringify(state), snapshot); // 1회성
    holdFeast(FEASTS[1]); holdFeast(FEASTS[2]); holdFeast(FEASTS[3]);
    assert.equal(state.unlockFlags.festivalScene, true); assert.equal(state.unlockFlags.regionalFestival, true);
    assert.equal(state.level, 9); // 잔치 소비(총 5.05천t)도 LV 진행 → LV.9
    state = cloneInitialState(); state.rice = 29999; holdFeast(FEASTS[0]); assert.equal(state.feastsDone.neighborhood, undefined);`);
});

test('donation counts as consumption, respects the selected ratio and minimum, and awards badges once', () => {
  createGame().run(`state = cloneInitialState(); state.rice = 100000;
    for (const m of milestones) state.claimedMilestones[m.id] = true; // 마일스톤 보상 제외하고 기부만 확인
    setDonationRatio(0.25); donateRice();
    assert.equal(state.rice, 75000); assert.equal(state.donated, 25000); assert.equal(state.consumed, 25000);
    assert.equal(state.donationBadges.d1, true); assert.ok(state.boosterCount >= 1);
    const boosters = state.boosterCount;
    setDonationRatio(1); donateRice(); assert.equal(state.rice, 0); assert.equal(state.donated, 100000);
    assert.equal(state.donationBadges.d2, undefined);
    state.rice = 99; donateRice(); assert.equal(state.donated, 100000); // 최소 기부량 미만
    assert.equal(state.level, 4); // 누적 소비 100kg → LV.4 (25kg 이상, 125kg 미만)`);
});

test('orders scale with production, pay 1.5x on delivery, expire, and can be skipped', () => {
  const g = createGame();
  g.run(`state = cloneInitialState(); state.rice = 0; checkOrderState();
    assert.equal(state.order.status, 'offered'); const o = state.order; const r = getOrderRecipe(o);
    assert.ok(isRecipeUnlocked(r)); assert.ok(o.qty >= ORDER_CONFIG.minQty);
    assert.equal(o.reward, Math.floor(r.cost * o.qty * 1.5));
    deliverOrder(); assert.equal(state.order.status, 'offered'); // 쌀 부족: 그대로
    state.rice = r.cost * o.qty + 5; const booster = state.boosterCount;
    deliverOrder();
    assert.equal(state.rice, 5 + o.reward); assert.equal(state.consumed, r.cost * o.qty);
    assert.equal(state.boosterCount, booster + o.booster);
    assert.equal(state.order.status, 'cooldown'); checkOrderState(); assert.equal(state.order.status, 'cooldown');`);
  g.advance(60000);
  g.run(`checkOrderState(); assert.equal(state.order.status, 'offered');
    // 생산량이 크면 주문 수량도 커짐
    state.autoTool = { tier: 8, level: 1 }; endOrder(); state.order.nextAt = 0; checkOrderState();
    const big = state.order; assert.ok(getOrderRecipe(big).cost * big.qty >= getPerSecond(state, {ignoreTimedBuffs: true}) * 59);
    skipOrder(); assert.equal(state.order.status, 'cooldown');
    state.order.nextAt = 0; checkOrderState(); assert.equal(state.order.status, 'offered');`);
  g.advance(300001);
  g.run(`checkOrderState(); assert.equal(state.order.status, 'cooldown'); // 5분 지나면 만료`);
});

test('missing images fall back to emoji and are requested only once', () => {
  createGame().run(`
    const src = RECIPES[5].icon;
    assert.match(iconHtml(src, '🍙'), /<img/);
    markMissingImage({ getAttribute: () => src, dataset: { emoji: '🍙' }, replaceWith() {} });
    assert.equal(iconHtml(src, '🍙'), '<span class="emoji-icon">🍙</span>');
    assert.match(iconHtml(RECIPES[0].icon, '🍚'), /<img/); // 다른 이미지는 그대로`);
});

test('fertilizer booster: remaining time can never exceed 30 minutes; blocked use keeps the fertilizer', () => {
  const g = createGame();
  g.run(`state = cloneInitialState(); state.boosterCount = 40;
    for (let i = 0; i < 30; i++) useBooster();                       // 60초 × 30 = 정확히 30분
    assert.equal(state.boosterEndTime - Date.now(), 30 * 60 * 1000); assert.equal(state.boosterCount, 10);
    useBooster();                                                     // 30:00 + 1:00 → 거부
    assert.equal(state.boosterCount, 10); assert.equal(state.boosterEndTime - Date.now(), 30 * 60 * 1000);
    assert.equal(state.dailyProgress.boosterUse, 30);                 // 거부된 사용은 미션에도 안 셈`);
  g.advance(59 * 1000);                                               // 남은 29:01
  g.run(`const end = state.boosterEndTime; useBooster();
    assert.equal(state.boosterEndTime, end); assert.equal(state.boosterCount, 10); // 29:01 + 1:00 > 30:00 → 거부`);
  g.advance(1000);                                                    // 남은 29:00
  g.run(`useBooster(); assert.equal(state.boosterEndTime - Date.now(), 30 * 60 * 1000); assert.equal(state.boosterCount, 9); // 딱 30분은 허용`);
});

test('fertilizer booster: huge rice-meal bonus is capped at 30 minutes when off and the rest is kept for later', () => {
  createGame().run(`resetReady(); state.boosterCount = 2; state.boosterEndTime = 0;
    selectedRecipeQty = 100; useRecipe(recipe('meal'));              // 적립 +6000초 → 다음 비료 101분
    assert.equal(state.boosterDurationBonusSeconds, 6000);
    useBooster();
    assert.equal(state.boosterEndTime - Date.now(), 30 * 60 * 1000);   // 30분까지만 적용
    assert.equal(state.boosterCount, 1);
    assert.equal(state.boosterDurationBonusSeconds, 6060 - 1800);     // 못 쓴 4260초는 다음 비료용으로 남음
    useBooster(); assert.equal(state.boosterCount, 1);               // 켜져 있고 넘치므로 거부`);
});

test('Ollie base image follows game LV (ollie_1..12.png) and falls back to the default Ollie once a file is missing', () => {
  const g = createGame();
  const img = g.node('#ollieImage');
  g.run(`showOllieReaction = (src, duration) => { clearTimeout(ollieReactionTimer); setOllieImage(src);
      ollieReactionTimer = setTimeout(() => { ollieReactionTimer = 0; setOllieImage(getOllieBaseImage()); }, duration); };
    state = cloneInitialState(); renderStats();`);
  assert.equal(img.src, './assets/images/characters/ollie_1.png');
  for (const level of [2, 7, 12]) {
    g.run(`state.level = ${level}; renderStats();`);
    assert.equal(img.src, `./assets/images/characters/ollie_${level}.png`);
  }
  g.run(`showOllieReaction('./assets/images/characters/ollie_happy.png', 1000); renderStats();`);
  assert.equal(img.src, './assets/images/characters/ollie_happy.png'); // 반응 중에는 LV 이미지로 덮어쓰지 않음
  g.advance(1000);
  assert.equal(img.src, './assets/images/characters/ollie_12.png');   // 반응 끝나면 LV 이미지로 복귀
  img.src = './assets/images/characters/ollie_12.png'; g.run('handleOllieImageError(); renderStats();');
  assert.equal(img.src, './assets/images/characters/ollie_harvest.png'); // 파일 없음 → 기본 올리
  g.run('renderStats(); renderStats();');
  assert.equal(img.src, './assets/images/characters/ollie_harvest.png'); // 다시 요청하지 않음
  g.run('state.level = 3; renderStats();');
  assert.equal(img.src, './assets/images/characters/ollie_3.png');      // 다른 LV 파일은 따로 시도
});
