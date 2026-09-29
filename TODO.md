# 올리의 수확 — 현황 및 TODO

> **2026-09-29 전면 재작성.** 이전 버전(8/17·9/1·9/28 검증 기록, 과거 의사결정 표 등)은 현재 코드와 맞지 않는 부분이 많아 삭제하고, 현재 `main` 코드 기준으로 다시 정리했다. 과거 기록이 필요하면 git 히스토리의 이전 `TODO.md`를 참고한다.
>
> - 1장: 지금 구현되어 있는 것 (코드 기준 요약)
> - 2장: 알려진 이슈 / 미결 사항
> - 3장: 하단 탭 화면의 SPA 전환 개편 — **완료 (2026-09-29)**

---

## 1. 현재 구현 요약 (2026-09-29, `main` 기준)

### 1.1 저장소 구성
| 경로 | 역할 |
| --- | --- |
| `backend/` | FastAPI + SQLite(`app.db`, SQLAlchemy). `main.py`(API), `models.py`, `schemas.py`, `database.py`, `game_levels.py`(프론트 `GAME_LEVELS` 미러) |
| `frontend/index.html` | 게임 본 화면. 홈 + 5개 탭 화면(`#screenViewport` 안) + 다이얼로그가 한 파일에 있음. 퀵메뉴·로그아웃 스크립트는 인라인 |
| `frontend/js/router.js` | 하단 탭 화면 전환(해시 SPA 라우터). 모든 스크립트 중 마지막에 로드 |
| `frontend/game.js` | 게임 로직 전체 (상태, 계산, 렌더, 서버 동기화, 게임 루프) |
| `frontend/js/balance-config.js` | 밸런스 수치 전용 (LV, 장비, 레시피, 마일스톤, 미션, 출석, 문구 등). `game.js`보다 먼저 로드 |
| `frontend/auth.html`, `js/auth.js`, `css/auth.css` | 로그인/회원가입 |
| `frontend/styles.css` | 게임 화면 스타일 (약 2,200줄, 후반부로 갈수록 덮어쓰기 규칙 누적) |
| `tests/game.test.cjs` | 의존성 없는 Node VM 회귀 테스트 16개 (`node --test tests/game.test.cjs`) |
| `GAME_DESIGN.md` / `README.md` / `CHANGES.md` / `GCP.md` | 기획서(구버전 설계) / 소개(구버전) / 9/27 수정 내역 / GCE 배포 가이드(미커밋) |

### 1.2 백엔드 API
- 인증: `POST /signup`(bcrypt, 8자리 친구 코드 자동 발급), `POST /login`, `GET /`
- 저장: `GET /save?user_id=`, `PUT /save` — 프론트 `state` 객체 전체를 JSON 문자열 1건으로 저장
- 랭킹: `GET /leaderboard/weekly`(ISO 주차 `weeklyHarvest` 기준 TOP N + 내 순위) — 프론트 사용 중 / `GET /leaderboard`(누적 소비량 기준) — 미사용
- 친구: `GET /friends/search`, `POST /friends/request`(친구 코드), `GET /friends/requests`, `POST /friends/accept`, `POST /friends/decline`, `GET /friends`(주간 수확량 순, 게임 LV 포함)
- 인증 토큰 없음: 모든 API가 요청의 `user_id`를 그대로 신뢰 (프로토타입 범위의 의도적 단순화)
- CORS: `localhost:4174`, `127.0.0.1:4174`만 허용. 배포 시에는 Nginx 동일 오리진 프록시(`GCP.md`)라 CORS 불필요, 프론트 `API_BASE_URL`이 포트 4174 여부로 자동 전환

### 1.3 게임 시스템 (`game.js` + `balance-config.js`)
- **재화/지표**: 보유 쌀알(`rice`, 1 = 1g), 누적 소비량(`consumed`, 핵심 점수), 누적/주간 수확량, 비료 부스터 개수. **인기도는 폐지됨**(구버전 저장은 `normalizeState()`에서 레시피 해금 이력으로만 이관 후 삭제)
- **게임 LV 1~12**: 누적 소비량 기준, 레벨별 1회 보상(부스터, 영구 % 보너스, 해금 플래그, 부스터 배율 보너스). LV.12 "신농" 달성 시 `festivalDialog` 표시 (구 "작은 쌀 축제" 목표 대체)
- **수확 장비**: 수동/자동 각 12티어 × 내부 강화 레벨. `basePower = 5^(tier-1)`, 다음 티어는 게임 LV = 티어 번호 이상일 때 구매 가능
- **레시피 5종**(×1/×10/×100/MAX): 누적 소비량으로 해금(0 / 600g / 1.2kg / 2.5kg / 5kg)
  - 밥: 다음 부스터 +60초×수량 / 김밥: 클릭 ×3, 30초×수량 / 떡: 자동 ×3, 30초×수량 / 쌀빵: 다음 부스터 +0.5배(수량만큼 횟수 적립) / 누룽지: 전체 ×2, 45초×수량
- **비료 부스터**: 기본 ×2, 60초. 사용 중 재사용 시 시간만 연장, 배율은 중첩하지 않음. **남은 시간 최대 30분**(`BOOSTER_CONFIG.maxActiveSeconds`): 켜진 상태에서 남은 시간 + 이번 시간이 30분을 넘으면 사용 거부(비료 차감 없음, 안내 토스트). 꺼진 상태에서 밥 적립 시간이 많아 30분을 넘으면 30분만 적용하고 남은 적립 시간은 다음 비료에 보존
- **소비 마일스톤 20단계**(1kg ~ 5000t): 통계 화면의 가로 드래그/스와이프 카드. 게임 LV와 별개 보상 트랙
- **오늘의 미션 4종**(클릭/업그레이드/레시피/부스터 사용), 로컬 자정 리셋, 보상은 비료 부스터만
- **출석 7일판**: 접속한 날마다 1칸(연속 불필요), 7일 완료 후 반복 없음. 쌀알/부스터 보상
- **오프라인 보상**: 마지막 저장 이후 최대 24시간, 타임 버프 제외 자동 생산량 기준
- **배경 성장 5단계**(작은 논 → 수확 축제), 홈 하단 "오늘의 문구"(50종, 접속할 때마다 무작위 · 직전 접속 문구 제외), 벼 성장(LV 진행도) 카드
- **시연용 관리자 모드**: 로고 3초 내 5회 클릭 → 쌀알 지급 + **게임 LV 이동**(2026-09-29, `setAdminLevel`: 누적 소비량을 해당 LV 기준값으로. 내려갈 때 그보다 높은 LV 보상·소비 마일스톤 보상을 되돌리고 기록을 지워 다시 올라가면 연출·보상이 한 번만 다시 나옴. 장비 티어·잔치·기부 기록은 유지) 패널. `ADMIN_MODE_ENABLED`로 차단 (**현재 `true`**)
- **LV별 올리 이미지** (2026-09-29): 홈 올리 기본 이미지가 게임 LV에 따라 `assets/images/characters/ollie_{LV}.png`(1~12). 파일이 없으면 `ollie_harvest.png`로 대체하고 같은 파일은 다시 요청하지 않음(`getOllieBaseImage`/`handleOllieImageError`). 기쁨·업그레이드 반응 이미지는 기존 공용 이미지 유지 — ollie_1~12.png 추가됨(2026-09-29)
- **기쁨 연출** (2026-09-29): 예전 `ollie_happy.png`로 올리 이미지를 바꾸던 곳(비료 사용·레시피·LV업·잔치/기부/주문·이벤트 보상)은 이제 올리 이미지는 그대로 두고 머리 위로 `assets/images/effects/happy1~3.png` 중 무작위 1장(직전과 다른 것)이 1.3초간 떠올랐다 사라짐(`showHappyPop`). 한 행동에서 여러 번 불려도 0.3초 안에는 1개만. 파일이 없으면 😊로 대체. 참고: 쌀 소비 탭에서 레시피를 쓰면 홈 화면이 가려져 있어 연출이 보이지 않음(예전 이미지 교체도 동일)
- 효과음(Web Audio 생성 톤) On/Off, Canvas 논 배경 애니메이션
- **보유 쌀알 숫자 애니메이션** (2026-09-29): 클릭·보상 등 한 번에 늘어난 양은 0.6초 동안 감속하며 흐르듯 올라감(`game.js` `startRiceTween`/`getDisplayedRice`). 실제 값(`state.rice`)은 즉시 바뀌고 표시만 따라감. 자동 수확은 즉시 반영, 소비(감소)는 즉시 반영. 프레임이 멈춰도 앞부분을 건너뛰지 않도록 1회 진행량 34ms 상한. 보유 쌀알은 kg 이상에서 항상 소수점 두 자리(`formatRiceAmount`, 내림) + 숫자 폭 고정(`font-variant-numeric: tabular-nums`)으로 올라가는 동안 좌우 흔들림 없음

### 1.4 저장/동기화
- `localStorage` 키 `ollies-harvest-save-v2:<user_id>` (계정별 분리), 세션은 `localStorage["currentUser"]`
- `saveState()` = 로컬 저장 + `PUT /save`(fire-and-forget). 15초 주기 자동 저장, `beforeunload`·화면 가려짐(`visibilitychange`, 휴대폰 앱 전환) 때 저장, 주요 행동마다 저장
- 수동 **저장 버튼은 2026-09-29 제거**(자동 저장과 같은 동작이라 불필요). 상단 툴바: 초기화 / 소리 / 로그아웃
- 시작 시 `syncFromServer()`: 서버 `lastSavedAt`이 로컬보다 최신이면 서버 데이터로 교체

### 1.5 화면 구성 (현재)
- **홈** (`main#homeScreen.app`): 상단 툴바(초기화/소리/로그아웃) + 로고, 지표 바 4칸(보유 쌀알 / 초당 / 클릭당 / 비료 부스터 개수 — 2026-09-29 비료를 별도 위젯에서 지표 바 안으로 이동), 부스터 상태 패널, 퀵메뉴 5종, 올리 수확 버튼, 하단 패널(오늘의 문구 / LV 카드 / 비료 사용)
- **퀵메뉴 5종**(모두 `<dialog>` 팝업): 올리의 기록(레시피 도감 + 성장 보상 기록), 이벤트(랜덤 과제, 1.6절), 공지(사용법 게시글, `index.html` 정적 HTML), 오늘의 미션, 출석
- **하단 네비게이션 6탭** (`nav.bottom-nav`, `position: fixed`): 홈 / 업그레이드(장비, 휴대폰에선 '강화'로 표시) / 쌀 소비(레시피·잔치·기부·주문, 1.8절) / 통계(요약·배경·장비·마일스톤) / 랭킹 / 친구 — 미션 탭은 2026-09-29 제거(오늘의 미션은 홈 퀵메뉴 팝업, 예전 `#mission` 주소는 홈으로)
- 올리 클릭 시 눌림·호버 효과는 올리 이미지(`.ollie-image`)에만 적용 — "수확하기" 라벨은 고정
- 탭 전환 방식 (3장에서 개편): `js/router.js`의 해시 라우터. URL 해시(`#home` `#upgrade` `#mission` `#stats` `#ranking` `#friends`)가 현재 화면이고, 새로고침·뒤로가기 지원. 페이지 전체는 스크롤하지 않고 하단 네비 위 `#screenViewport`(position: fixed)에 한 화면만 표시, 각 화면은 자기 안에서만 스크롤(화면별 스크롤 위치 기억). 화면 진입 시 200ms 페이드. 랭킹/친구 데이터 로드·통계 마일스톤 중앙 정렬·홈 Canvas/퀵메뉴 재측정은 화면 진입 훅에서 실행

### 1.6 랜덤 이벤트 (2026-09-29 추가)
- 설정: `balance-config.js`의 `RANDOM_EVENTS`(6종) / `EVENT_CONFIG`(보상 배율 1.5, 최소 보상 100g, 쿨다운 180초)
  - 번개 수확(1분 안에 20클릭), 폭풍 수확(30초 안에 15클릭), 함께 짓는 농사(친구 요청 보내기 또는 수락), 비료 뿌리는 날(부스터 1회), 오늘은 내가 요리사(레시피 2회), 장비 손질(강화 1회)
- 흐름: 무작위 1개 제시(ready) → 카드 눌러 시작(active, 시작 이후 행동만 집계) → 달성(complete) → 카드 눌러 보상 → 쿨다운(claimed) → 직전과 다른 이벤트 무작위 등장. 시간 제한 초과 시 failed → 카드 눌러 다시 도전. 시작 전/실패 시 "다른 이벤트로 바꾸기" 가능
- 보상: 받는 순간 보유 쌀알이 1.5배가 되도록 차액 지급(`gainRice` 사용 → 누적/주간 수확량에도 포함), 최소 100g
- 저장: `state.event`(로컬 + 서버 저장 JSON에 자동 포함, 구버전 저장은 `normalizeState`에서 기본값 병합)
- 퀵메뉴 '이벤트' 버튼에 새 이벤트/보상 대기 시 빨간 점 표시

### 1.7 모바일 / 웹앱 (2026-09-29 추가)
- `styles.css` 맨 끝 "모바일 / 웹앱" 섹션(600px 이하에서만 적용, 데스크톱 화면은 그대로)
  - 홈: 로고 + 아이콘 버튼 4개 한 줄, 지표 바, 얇은 비료 상태 띠, 바로가기 5개 한 줄, 올리는 남는 공간 가운데, LV 카드 한 줄 제목 + 표지판·비료 사용 → 390×844 기준 스크롤 없이 한 화면
  - 카드 목록: 아이콘 | 내용 | 가격·상태 알약 한 줄 / 통계 배경 5단계 한 줄 / 팝업은 아래에서 올라오는 시트(내용 높이만큼) / 스크롤바 숨김 / 하단 네비 구분선 제거
  - 터치: 탭 하이라이트 제거, 연타 시 더블탭 확대 방지(`touch-action: manipulation`), 입력칸 16px(iOS 자동 확대 방지), safe-area(노치) 여백
  - `index.html` 인라인 스크립트: 600px 이하에서는 바로가기 버튼/팝업 크기를 JS로 강제하지 않음(`isPhoneLayout`)
- 웹앱(홈 화면에 추가): `frontend/manifest.json`, 아이콘 `assets/images/icons/`(올리 초상화 기반 512/192/180px), `index.html`·`auth.html`에 manifest/theme-color/apple-touch-icon 메타. Chrome 기준 manifest 파싱·설치 가능 오류 없음 확인
  - 참고: 안드로이드 Chrome의 "앱 설치"(주소창 없는 실행)는 **HTTPS에서만** 동작. 현재처럼 `http://IP`로 접속하면 바로가기만 생김 → GCP.md 15장(도메인 + HTTPS) 적용 필요. iOS Safari "홈 화면에 추가"는 http에서도 전체 화면 실행
- 로그인 화면: 논밭 배경 이미지, 입력칸 16px
- 휴대폰 글자 크기 한 단계 축소(2026-09-29, `styles.css` 끝 "휴대폰 글자 크기" 블록): 기본 16→14px, 제목·지표·카드 등 1~2px씩 작게. 입력칸은 16px 유지. 데스크톱은 변경 없음

### 1.8 쌀 소비 탭 (2026-09-29 추가, `#consume`)
- **레시피 11종**: 기존 5종 + 주먹밥(20kg 해금·1kg, 60초간 클릭 10% 확률 ×10 대박) / 식혜(100kg·5kg, 쉬는 동안 수확 영구 +5%, 최대 +100%) / 쌀과자(500kg·20kg, 쓴 양의 +50%를 소비량으로 추가 인정 — 쌀알은 돌려주지 않음) / 떡국(2.5t·100kg, 다음 LV 보상 2배, 남은 LV 수까지 적립) / 비빔밥(10t·500kg, 켜진 레시피 효과 시간 +30초) / 쌀국수(50t·2t, 비료 +1, 하루 최대 5개)
- **잔치 4단계**(`FEASTS`, 순서대로 1회): 동네 밥상 30kg(전체 +5%) → 학교 급식 지원 1t(자동 +10%) → 작은 쌀 축제 50t(전체 +10% · 홈 배경 축제로 고정) → 지역 대표 쌀 축제 5천t(전체 +15% · LV 카드에 🏆)
- **쌀 기부**(`DONATION_CONFIG`/`DONATION_BADGES`): 비율(10/25/50/100%) 고른 뒤 기부 버튼(오조작 방지 2단계). 누적 소비량 인정, 누적 기부량 배지 4종(비료 보상)
- **주문 배달**(`ORDER_CONFIG`): 해금된 레시피 N개 주문(수량 = 자동 생산 60~180초치), 5분 제한, 납품 시 쓴 쌀 ×1.5 대금(20% 확률 비료 +1), 거절 가능, 60초 쿨다운
- 저장 필드 추가: `offlineBonus`, `levelRewardDoubleCharges`, `feastsDone`, `donated`, `donationBadges`, `order`, `buffs.critUntil/critMultiplier`, `dailyProgress.noodleBooster` — `normalizeState`가 구버전 저장에 기본값 병합
- 이미지: 신규 16종은 아직 파일 없음 → `iconHtml()`이 이모지로 대신 표시하고, 없는 파일은 세션당 1번만 요청(`missingImages`). 파일을 넣으면 새로고침 후 자동으로 이미지 표시
- 레시피·잔치·기부·주문 버튼 모두 `renderStableButtonList`로 그려 누르는 도중 교체되지 않음 → 2.1절의 "레시피 버튼 클릭 누락" 해결

### 1.9 검증 상태
- `node --check`(game.js, balance-config.js, auth.js, router.js) 통과, `node --test tests/game.test.cjs` 16/16 통과 (2026-09-29 확인)
- 브라우저 스모크 테스트(headless Chrome, 3장 Step 6) 통과 (2026-09-29)

---

## 2. 알려진 이슈 / 미결 사항

### 2.1 버그·위험 (수정 필요)
- [ ] **관리자 모드 활성 상태로 배포 커밋됨** — `balance-config.js`의 `ADMIN_MODE_ENABLED = true`. 제출 전 `false` + `index.html`의 `balance-config.js?v=` 버전 올리기
- [ ] **주간 키 시간대 불일치** — 프론트 `getISOWeekKey()`는 로컬 날짜, 백엔드 `get_current_week_key()`는 UTC. 한국 기준 매주 월요일 00~09시 동안 랭킹/친구 목록의 주간 수확량이 0으로 표시됨
- [ ] **닉네임 HTML 미이스케이프(저장형 XSS)** — 랭킹/친구 요청/친구 목록이 닉네임을 `innerHTML`에 그대로 삽입
- [ ] **멀티탭/멀티계정 저장 덮어쓰기** — 같은 브라우저에서 다른 계정으로 로그인하면, 열려 있던 기존 탭의 자동 저장이 새 계정의 서버 저장을 덮어씀(`currentUser`가 오리진 공용 `localStorage`). 세션 구조 변경 필요, 방향 결정 필요
- [x] **초기화 버튼 확인 절차 없음** — 2026-09-29 해결: 확인 팝업(`#resetDialog`)에서 '예, 초기화'를 눌러야만 초기화, 초기화 즉시 서버 저장도 덮어씀
- [ ] 랭킹의 "(나)" 판정이 닉네임 비교라 동명이인도 "(나)"로 표시됨
- [x] **보상 받기 클릭이 잘 안 먹던 문제** (2026-09-29 수정) — 출석/오늘의 미션(탭·팝업) 카드가 300ms마다 새 버튼으로 교체되어, 누르는 도중 노드가 바뀌면 클릭이 무시됨(실제 마우스 입력 기준 성공률 출석 4/10, 미션 탭 1/10, 미션 팝업 3/10). `game.js`에 `renderStableButtonList()`를 추가해 버튼은 한 번만 만들고 내용만 갱신 → 전부 10/10. 회귀 테스트 17번 추가
- [x] 카드형 버튼(`button.game-card`) 내부 요소에 `pointer-events: none` 적용 — 누르는 도중 카드 내용(보상 금액, 남은 시간)이 바뀌어도 클릭 대상이 버튼 자체라 씹히지 않음. 이벤트 '받기' 카드를 0.8초 길게 눌러도 수령 확인 (2026-09-29)
- [ ] 같은 원인이 남아 있는 곳: 업그레이드 화면의 장비 강화 버튼(`renderUpgrades`)은 여전히 300ms마다 새로 만들어짐 → 같은 방식으로 수정 필요 (레시피 버튼은 2026-09-29 쌀 소비 탭 작업에서 해결)

### 2.2 미구현 / 정리 필요
- [x] 퀵메뉴 '이벤트' / '공지' 실제 내용 — 2026-09-29 구현 (공지: 사용법 게시글, 이벤트: 1.6절)
- [ ] `GET /leaderboard` 미사용 엔드포인트 정리 여부
- [ ] `GAME_LEVELS` 프론트/백엔드 수동 복제 (유지보수 리스크)
- [ ] `README.md`, `GAME_DESIGN.md`, `CHANGES.md`가 현재 구현(인기도 폐지, 게임 LV, 서버 저장, 24시간 오프라인, 테스트 16개 등)과 불일치
- [ ] `GCP.md` 미커밋

### 2.3 확정된 제외 항목
- 실제 사운드 파일 적용 제외 (Web Audio 생성 톤 유지)
- 홈의 "최종 목표/활성 효과" 카드(`bottom-cards`)는 `hidden`으로 비활성화 유지

---

## 3. [완료 2026-09-29] 하단 탭 화면 SPA 전환 개편

### 3.1 목표
업그레이드 / 미션 / 통계 / 랭킹 / 친구 화면이 "홈 아래로 이어진 긴 페이지"처럼 느껴지지 않고, 하단 네비게이션으로 **각각 독립된 화면(창)으로 이동**하는 SPA 구조로 바꾼다.

- 한 번에 한 화면만 뷰포트를 차지하고, 화면을 넘어 다른 화면으로 스크롤되지 않는다
- 화면 이동 시 페이드 전환 효과가 있다
- 각 화면은 자기 영역 안에서만 스크롤하고, 탭을 오가도 화면별 스크롤 위치가 유지된다
- URL(해시)로 현재 화면이 표현되어 새로고침해도 같은 화면이 유지되고, 브라우저/안드로이드 뒤로가기로 이전 화면으로 돌아간다
- 게임 로직·저장 데이터·밸런스·백엔드는 **변경하지 않는다**

### 3.2 개편 전 구조 분석 (변경 대상)
| 항목 | 현재 | 문제 |
| --- | --- | --- |
| 화면 배치 | `body` 직속에 `main#homeScreen` + `section.app-screen` 5개가 세로로 나열 | 모든 화면이 하나의 문서 흐름 안에 있음 |
| 스크롤 | `window` 스크롤 하나를 모든 화면이 공유 (`body`에 하단 네비 높이만큼 padding) | 홈에서 내려간 위치 그대로 다른 탭이 열림, 화면 간 경계가 없음 |
| 전환 로직 | `index.html` 인라인 `showTab()`이 `hidden` 토글 | URL 없음, 뒤로가기 불가, 새로고침 시 항상 홈, 전환 효과 없음 |
| 진입 시 처리 | 랭킹/친구 로드는 nav 버튼 click 핸들러에서, 통계의 마일스톤 중앙 정렬은 `showTab` 안에서 | 클릭 외 경로(URL 진입 등)로 들어오면 데이터 로드가 안 됨 |
| 홈 Canvas | `resizeCanvas()`는 `window resize` 때만 호출 | 숨김 상태에서 크기 측정 시 0이 되는 등, 화면 복귀 시 재측정 필요 |
| 퀵메뉴 크기 | `syncQuickMenuButtonSize()`가 `load`/`resize` 때 `.hero-stats` 높이를 측정 | 홈이 숨겨진 상태로 로드되면 0으로 측정됨 |

> 참고: 코드상으로는 이미 `hidden` 토글로 탭이 전환되고 있었다. "메인 아래로 드래그하면 다른 창이 나온다"는 증상의 실제 원인은 Step 0 참고 (닫힌 다이얼로그가 페이지 아래에 펼쳐져 있던 CSS 버그).

### 3.3 설계 결정
1. **해시 라우팅** (`#home`, `#upgrade`, `#mission`, `#stats`, `#ranking`, `#friends`) — 가장 단순한 형태(해시 = 탭 이름)로 결정 (사용자 확인, 2026-09-29)
   - 정적 호스팅(Nginx `try_files`, GitHub Pages)에서 서버 설정 변경 없이 동작. History API(`/upgrade` 같은 경로)는 Nginx fallback 설정이 추가로 필요해 채택하지 않음
   - 알 수 없는 해시는 `#home`으로 대체. 탭 클릭은 `location.hash` 변경만 하고, 실제 화면 전환은 `hashchange` 한 곳에서만 처리 (클릭/뒤로가기/직접 진입 경로 통일)
2. **앱 셸 레이아웃**
   - `body`는 스크롤하지 않음. `#screenViewport`(`position: fixed; top:0; bottom: 하단 네비 높이`) 안에 6개 화면을 겹쳐 두고, 각 화면이 `overflow-y: auto`로 **자기 안에서만 스크롤** (구현 시 `100dvh` 계산 대신 fixed 배치로 단순화 — 모바일 주소창 높이 변화에도 자동 대응)
   - 하단 네비는 지금처럼 고정. 다이얼로그(`<dialog>`)는 top layer라 영향 없음
3. **전환 효과**
   - **페이드**로 결정 (사용자 확인, 2026-09-29): 새 화면 `opacity 0 → 1` 약 200ms. 이전 화면은 즉시 숨김(겹침·방향 계산 불필요)
   - `prefers-reduced-motion: reduce`이면 애니메이션 없이 즉시 전환
   - 이전 화면은 즉시 `hidden` 처리해 탭 순서/스크린리더에서 제외 (접근성 유지). 연타해도 항상 한 화면만 보임
4. **화면 레지스트리 + 진입 훅**
   - 화면 정의를 한 곳에 모음: `{ id, element, onEnter }`
   - `onEnter`: 홈 → Canvas 재측정·퀵메뉴 크기 동기화, 통계 → 마일스톤 중앙 정렬, 랭킹 → `loadLeaderboard()`, 친구 → `loadFriendsScreen()`
5. **코드 위치**
   - `index.html` 인라인 탭 스크립트를 `frontend/js/router.js`로 분리해 `game.js` 다음에 로드. `game.js` 게임 로직은 건드리지 않고, 필요한 경우 전역 함수(`resizeCanvas`, `centerCurrentMilestone`, `loadLeaderboard`, `loadFriendsScreen`)를 호출만 함
   - 퀵메뉴·로그아웃 인라인 스크립트는 이번 범위에서 동작 유지 (이동은 선택)
6. **범위 밖 (이번에 하지 않음)**
   - 화면 좌우 스와이프로 탭 이동 — 제외 확정 (사용자 확인, 2026-09-29). 통계 마일스톤 가로 드래그, 모바일 기본 뒤로가기 제스처와 충돌 위험
   - 퀵메뉴 다이얼로그를 라우트화(`#storage` 등)하는 것
   - 게임 로직/렌더 성능 최적화, 2장의 버그 수정

### 3.4 작업 단계 (순차 진행, 단계마다 검증 후 다음으로)

- [x] **Step 0. 현재 동작 재현·기준 확인** — 완료 (2026-09-29)
  - 백엔드(uvicorn) + 정적 서버(4174)를 띄우고 headless Chrome(CDP)으로 430px / 1280px 폭에서 확인 (Chrome 확장 미연결로 CDP 직접 사용)
  - **결과: (b) 실제로 화면이 이어져 보이는 버그였음.** 탭 화면 자체는 `hidden`으로 정상 숨김되지만, **닫혀 있어야 할 `<dialog>` 7개(올리의 기록/이벤트/공지/오늘의 미션/출석/게임 LV/LV.12 축하)가 페이지 맨 아래에 전부 펼쳐져 그려지고 있었다.** 문서 높이가 홈 기준 430px 폭 6,374px(홈 자체는 2,537px), 1280px 폭 5,086px(홈 1,250px) — 약 3,800px가 닫힌 다이얼로그. 어느 탭에서든 아래로 스크롤하면 이 "창"들이 보임
  - 원인: `styles.css`의 `.quick-dialog { display: flex }`, `.level-dialog { display: flex }` + `position: relative`가 브라우저 기본 규칙 `dialog:not([open]) { display: none }`을 덮어씀. 9/28 커밋 `5a66134`("모달창 닫기 버튼 우측 상단 고정")에서 유입
  - 조치: Step 1과 함께 `dialog:not([open]) { display: none; }` 규칙 추가로 수정 (아래 Step 3에 포함)

- [x] **Step 1. 라우터 모듈 분리** — 완료
  - `frontend/js/router.js` 신설: 화면 레지스트리(`SCREENS`: element + onEnter), `showScreen()`, nav 버튼 active·`aria-current` 동기화
  - `index.html`의 탭 전환 인라인 스크립트 제거 → 모든 스크립트 뒤에 `router.js?v=1` 로드
  - 랭킹/친구 로드와 마일스톤 중앙 정렬을 click 핸들러 → `onEnter` 훅으로 이동

- [x] **Step 2. 해시 라우팅 + 뒤로가기** — 완료
  - nav 클릭은 `location.hash = tab`만 수행, `hashchange`/최초 로드에서 화면 결정. 해시 없음 → 홈(URL 그대로), 알 수 없는 해시 → `replaceState`로 `#home`
  - 확인: 새로고침 시 현재 탭 유지, 뒤로/앞으로 가기, `#friends`로 새로고침해도 친구 코드·요청 목록 로드, 로그인 후 홈 진입

- [x] **Step 3. 앱 셸 레이아웃 (화면별 독립 스크롤)** — 완료
  - `index.html`: 6개 화면을 `#screenViewport`로 감싸고 각 화면에 `.screen` 클래스 추가 (id/내부 구조 유지 → `game.js` 영향 없음)
  - `styles.css`: `dialog:not([open]) { display: none }` 추가(Step 0 버그 수정), 파일 끝에 "SPA 화면 전환" 섹션 추가 — `body { overflow: hidden; padding-bottom: 0 }`, `.screen-viewport`, `.screen`(absolute, 내부 스크롤, `min-height: 0`), `.app.screen { grid-template-rows: max-content }`(홈 그리드 행이 뷰포트 높이로 눌려 `.field`가 잘리던 문제 방지)
  - 확인: 문서 높이 = 창 높이(`window.scrollY` 항상 0), 닫힌 다이얼로그 7개 전부 `display: none`, 홈은 하단 패널까지 내부 스크롤, 통계 스크롤 위치가 탭 왕복 후 유지 (430 / 760 / 1280px)

- [x] **Step 4. 화면 전환 애니메이션** — 완료
  - `.screen-enter` + `@keyframes screen-fade-in`(opacity 0→1, 200ms), 진입 때마다 클래스 재적용, `prefers-reduced-motion`이면 없음
  - 확인: 탭 이동 직후 `animationName = screen-fade-in`, opacity < 1에서 시작

- [x] **Step 5. 홈 화면 보정** — 완료
  - 홈 `onEnter`: `resizeCanvas()`, `syncQuickMenuButtonSize()`, `fitDailyPhrase()` 재실행
  - 확인: `#friends`에서 새로고침 후 홈 이동 시 Canvas·퀵메뉴 크기 정상. 관리자 패널(5회 클릭)은 데스크톱에서 `.field` 우측, 모바일에서 고정 오버레이로 기존과 동일하게 표시. 퀵메뉴 다이얼로그 크기 계산(`getBoundingClientRect` 기준)은 수정 불필요

- [x] **Step 6. 회귀 검증 및 마무리** — 완료
  - `node --check` 4개 파일 통과, `node --test tests/game.test.cjs` 16/16 통과
  - headless Chrome 화면 검증 21항목 (430 / 1280px 전부 통과, 760px은 통계 화면이 스크롤할 만큼 길지 않아 스크롤 복원 항목만 해당 없음)
  - UI 스모크 9항목 통과: 로그인 → 장비 내부 강화 → 레시피(밥) → 미션 수령 → 친구 요청 → 로그아웃 → 상대 계정 로그인·수락 → 재로그인 시 진행 복원, 예외 없음. 테스트 계정은 DB에서 정리함(`ttest`, `test`만 남음)
  - 캐시 버전: `styles.css?v=37`, `router.js?v=1` (`game.js`는 변경 없음)
  - 참고: `index.html` 자체에는 버전 쿼리를 붙일 수 없어서, 이미 접속했던 브라우저는 예전 `index.html`을 캐시에서 읽을 수 있다(검증 중 headless Chrome에서 실제로 발생). 반영이 안 보이면 강력 새로고침(Ctrl+F5). 배포 시 Nginx에서 `index.html`에 `Cache-Control: no-cache`를 주는 것을 검토할 만함

### 3.5 결정 사항 (2026-09-29 사용자 확인 완료)
- [x] 전환 효과: **페이드**
- [x] URL: 해시 노출 허용, **가장 단순한 방식**(`#upgrade`)
- [x] 좌우 스와이프 탭 이동: **제외**
