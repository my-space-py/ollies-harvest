// ============================================================================
// 올리의 수확 — 하단 탭 화면 전환 (해시 기반 SPA 라우터)
// ----------------------------------------------------------------------------
// URL 해시(#home, #upgrade, #consume, #mission, #stats, #ranking, #friends)가 현재 화면을 나타냅니다.
// 탭 클릭은 해시만 바꾸고, 실제 화면 전환은 hashchange 한 곳에서만 처리합니다.
// (탭 클릭 / 뒤로가기 / 새로고침 / 주소 직접 입력 경로가 모두 같은 흐름을 탑니다.)
// game.js와 index.html 인라인 스크립트보다 뒤에 로드해야 합니다.
// ============================================================================

const DEFAULT_SCREEN = "home";

// 각 화면에 들어올 때마다 실행할 작업(onEnter). 전역 함수는 game.js / index.html에서 정의됩니다.
const SCREENS = {
  home: {
    element: document.getElementById("homeScreen"),
    onEnter() {
      // 숨겨진 상태에서는 크기가 0으로 측정되므로 화면이 보인 뒤 다시 계산합니다.
      if (typeof resizeCanvas === "function") resizeCanvas();
      if (typeof syncQuickMenuButtonSize === "function") syncQuickMenuButtonSize();
      if (typeof fitDailyPhrase === "function") fitDailyPhrase();
    },
  },
  upgrade: { element: document.getElementById("upgradeScreen") },
  consume: { element: document.getElementById("consumeScreen") },
  mission: { element: document.getElementById("missionScreen") },
  stats: {
    element: document.getElementById("statsScreen"),
    onEnter() {
      if (typeof centerCurrentMilestone === "function") centerCurrentMilestone();
    },
  },
  ranking: {
    element: document.getElementById("rankingScreen"),
    onEnter() {
      if (typeof loadLeaderboard === "function") loadLeaderboard();
    },
  },
  friends: {
    element: document.getElementById("friendsScreen"),
    onEnter() {
      if (typeof loadFriendsScreen === "function") loadFriendsScreen();
    },
  },
};

const navButtons = document.querySelectorAll(".nav-btn[data-tab]");
// display:none이 되면 스크롤 위치가 사라지므로 화면별로 직접 기억했다가 복원합니다.
const savedScrollTop = {};
let currentScreen = null;

function getScreenFromHash() {
  const name = location.hash.slice(1);
  return Object.prototype.hasOwnProperty.call(SCREENS, name) ? name : null;
}

function showScreen(name) {
  if (name === currentScreen) return;

  if (currentScreen) {
    const previous = SCREENS[currentScreen].element;
    savedScrollTop[currentScreen] = previous.scrollTop;
    previous.hidden = true;
  }

  const next = SCREENS[name].element;
  next.hidden = false;
  next.scrollTop = savedScrollTop[name] || 0;
  // 같은 화면으로 빠르게 돌아와도 페이드가 다시 시작되도록 애니메이션 클래스를 재적용합니다.
  next.classList.remove("screen-enter");
  void next.offsetWidth;
  next.classList.add("screen-enter");

  navButtons.forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle("active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });

  currentScreen = name;
  const { onEnter } = SCREENS[name];
  if (onEnter) requestAnimationFrame(onEnter);
}

function handleRoute() {
  const name = getScreenFromHash();
  if (!name) {
    // 해시가 없거나 알 수 없는 값이면 홈으로 (방문 기록은 남기지 않음)
    if (location.hash) history.replaceState(null, "", `#${DEFAULT_SCREEN}`);
    showScreen(DEFAULT_SCREEN);
    return;
  }
  showScreen(name);
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.tab === currentScreen) return;
    location.hash = btn.dataset.tab;
  });
});

// 처음 화면을 정하기 전에 모든 화면을 숨겨 둡니다.
Object.values(SCREENS).forEach(({ element }) => {
  element.hidden = true;
});

window.addEventListener("hashchange", handleRoute);
handleRoute();
