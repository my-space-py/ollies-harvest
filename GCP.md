# 올리의 수확 — GCP(Compute Engine) 배포 가이드

이 문서는 `올리의 수확`(FastAPI 백엔드 + 정적 프론트엔드)을 **Google Compute Engine(GCE) 가상머신(VM) 1대**에, **프론트엔드와 백엔드를 함께** 배포하는 방법을 처음부터 끝까지 순서대로 설명합니다. GCP를 한 번도 써본 적 없어도 따라 할 수 있도록 각 단계를 클릭 단위로 풀어썼습니다.

> 전제: Google 계정은 있지만 GCP(Google Cloud)는 아직 가입하지 않은 상태.
> 저장소: `https://github.com/my-space-py/ollies-harvest` (공개 저장소이므로 별도 인증 없이 클론 가능)

---

## 0. 배포 구조 한눈에 보기

VM 1대 안에서 **Nginx 하나가 외부에 공개되는 유일한 창구**가 되고, 그 뒤에서 정적 파일 서빙과 API 요청 전달을 나눠 처리합니다. 이렇게 하면 프론트엔드와 백엔드가 "같은 주소(origin)"로 보이기 때문에 CORS 설정을 건드릴 필요가 없고, 백엔드 포트(8000)를 인터넷에 직접 열 필요도 없습니다.

```
[ 사용자 브라우저 ]
        │  http(s)://<VM 외부 IP>/  (포트 80/443만 외부 공개)
        ▼
┌───────────────────────────────────────────────┐
│                Compute Engine VM                │
│                                                   │
│  Nginx (포트 80, 외부 공개)                        │
│   ├─ "/", "/auth.html", "/game.js" 등            │
│   │     → frontend/ 정적 파일을 직접 응답          │
│   └─ "/signup, /login, /save,                    │
│       /leaderboard*, /friends*"                  │
│        → 127.0.0.1:8000 으로 프록시 전달           │
│                                                   │
│  FastAPI (Uvicorn, systemd 서비스)                 │
│   - 127.0.0.1:8000 (127.0.0.1에만 붙어서 외부 비공개)│
│   - SQLite 파일: backend/app.db                   │
└───────────────────────────────────────────────┘
```

이 문서는 이 구조를 그대로 만드는 순서입니다. 중간에 막히면 18장 "문제 해결"을 먼저 찾아보세요.

---

## 1. (사전 준비) 로컬에서 배포용 코드 변경사항을 커밋·푸시하기

프론트엔드가 백엔드를 호출하는 주소(`API_BASE_URL`)가 지금은 로컬 개발 환경(정적 서버 4174 + 백엔드 8000을 따로 실행)과 배포 환경(위 구조처럼 같은 주소로 묶기)을 자동으로 구분하도록 이미 코드에 반영해뒀습니다(`frontend/game.js`, `frontend/js/auth.js`). 로컬 저장소에 아직 커밋되지 않은 변경사항이 있다면, 배포 전에 먼저 커밋하고 원격 저장소(main 브랜치)에 푸시하세요.

```bash
git status
git add frontend/game.js frontend/js/auth.js
git commit -m "Add production API base URL auto-detection for GCE deploy"
git push origin main
```

> 이 커밋이 없으면 VM에 배포해도 프론트엔드가 계속 `http://127.0.0.1:8000`(방문자 자신의 컴퓨터)으로 API를 호출하려고 해서 로그인/저장/랭킹 등이 전부 실패합니다. 반드시 먼저 푸시하세요.

---

## 2. Google Cloud 계정 만들기 (가입)

1. 브라우저에서 [console.cloud.google.com](https://console.cloud.google.com) 접속 후, 가지고 있는 Google 계정으로 로그인합니다.
2. 처음 접속하면 "무료로 시작하기" 또는 "Get started for free" 안내가 나옵니다. 안내에 따라:
   - 국가 선택, 서비스 약관 동의
   - **결제 정보(신용/체크카드) 등록** — GCP는 무료 등급이 있어도 가입 시 카드 등록이 필수입니다. 카드에 소액(약 1달러) 인증 후 즉시 환불되는 방식이며, 이 문서대로만 쓰면 자동으로 유료로 전환되지 않습니다(아래 19장 "비용 안내" 참고).
   - 가입하면 **90일간 사용 가능한 $300 무료 크레딧**이 주어집니다. 이 크레딧과 별개로, 이 가이드에서 쓸 `e2-micro` VM 사양은 특정 리전에서 크레딧 소진 후에도 **평생 무료 등급(Always Free)** 조건에 들어갑니다(19장 참고).
3. 가입이 끝나면 [Google Cloud 콘솔](https://console.cloud.google.com) 첫 화면으로 이동합니다.

---

## 3. 프로젝트 만들기

GCP의 모든 리소스(VM 포함)는 "프로젝트" 단위로 묶입니다.

1. 콘솔 상단 좌측의 프로젝트 선택 드롭다운(가입 직후엔 "My First Project" 등으로 표시) 클릭 → **"새 프로젝트"**
2. 프로젝트 이름 입력 (예: `ollies-harvest`) → **만들기**
3. 생성 후, 상단 드롭다운에서 방금 만든 프로젝트를 선택해 활성화합니다. (이후 모든 작업은 이 프로젝트 안에서 이루어집니다.)

---

## 4. Compute Engine API 활성화

1. 콘솔 좌측 상단 ☰(메뉴) → **Compute Engine** → **VM 인스턴스** 클릭
   (또는 검색창에 "Compute Engine" 입력)
2. 처음 들어가면 "Compute Engine API 사용 설정" 버튼이 보입니다. 클릭하고 1~2분 기다립니다.
3. 활성화가 끝나면 VM 인스턴스 목록 화면(현재는 비어있음)으로 이동합니다.

---

## 5. VM 인스턴스 만들기

1. **"인스턴스 만들기"** 버튼 클릭
2. 아래 항목들을 설정합니다.

| 항목 | 설정값 | 설명 |
| --- | --- | --- |
| 이름 | `ollies-harvest-vm` | 원하는 이름으로 변경 가능 |
| 리전(Region) | `us-central1` (권장) 또는 `asia-northeast3`(서울) | 아래 참고 |
| 영역(Zone) | 리전 선택 시 자동 제안되는 값 그대로 | 예: `us-central1-a` |
| 머신 구성 | 시리즈 `E2`, 머신 유형 `e2-micro` | 무료 등급 대상 사양(아키텍처: x86_64) |
| 부팅 디스크 | **변경** 클릭 → 운영체제 `Ubuntu`, 버전 **Ubuntu 22.04 LTS (x86/64)**, 디스크 종류 `표준 영구 디스크`, 크기 `20`GB | 아래 "x86 vs ARM" 참고 |
| 방화벽 | **"HTTP 트래픽 허용"**, **"HTTPS 트래픽 허용"** 체크박스 모두 체크 | 나중에 13장에서 다시 확인합니다 |

> **리전 선택 팁**: `us-central1`, `us-west1`, `us-east1` 세 리전 중 하나를 고르면 `e2-micro` 인스턴스 1대가 **평생 무료**입니다(단, 한국에서 접속 시 지연시간이 150~250ms 정도로 다소 높습니다). 반대로 `asia-northeast3`(서울)를 고르면 응답 속도는 빠르지만 무료 등급 대상이 아니라서 `e2-micro`라도 매달 소액(대략 $5~7 내외) 요금이 청구됩니다. 데모/공모전 프로토타입 목적이라면 `us-central1`을 추천합니다.

> **x86 vs ARM**: 반드시 **x86_64**로 만드세요. 머신 시리즈를 `E2`(위 표 그대로)로 선택하면 애초에 ARM 옵션 자체가 없어서 자동으로 x86_64가 됩니다 — GCP의 ARM 인스턴스는 `Tau T2A`/`C4A(Axion)`라는 완전히 다른 시리즈로 별도 선택해야만 나옵니다. 다만 **부팅 디스크(운영체제 이미지)를 고를 때** 이미지 목록에 `Ubuntu 22.04 LTS`와 `Ubuntu 22.04 LTS (Arm)`이 둘 다 보일 수 있으니, 반드시 **Arm이라고 적혀있지 않은 쪽(x86_64)**을 선택하세요. 이유는 두 가지입니다: ① `e2-micro`(x86_64) 머신에 ARM 이미지를 올리면 아예 부팅이 안 됩니다(아키텍처 불일치). ② 이 프로젝트가 쓰는 `bcrypt`, `greenlet`, `httptools` 등은 컴파일된 패키지라 ARM에서도 대부분 동작은 하지만, 무료 등급(Always Free) 자체가 x86_64 `e2-micro`에만 적용되므로 ARM을 쓸 이유가 없습니다.

3. 다른 항목은 기본값 그대로 두고 하단 **"만들기"** 클릭합니다. 1분 이내로 VM이 생성되고, 목록에 초록색 체크와 함께 외부 IP 주소가 표시됩니다. **이 외부 IP 주소를 메모해두세요.**

---

## 6. (권장) 고정 외부 IP로 승격하기

기본으로 할당된 외부 IP는 "임시(ephemeral)"라서, VM을 껐다 켜면 바뀔 수 있습니다. 나중에 도메인을 연결하거나 IP를 계속 같은 걸로 쓰고 싶다면 고정 IP로 바꿔두세요. (VM이 켜져 있는 동안은 고정 IP도 추가 요금이 없습니다.)

1. ☰ 메뉴 → **VPC 네트워크** → **IP 주소**
2. 방금 만든 VM에 할당된 외부 IP 항목을 찾아 **"유형"을 "임시"에서 "고정"으로 전환**(또는 우측의 "정적 주소 예약" 버튼) 클릭
3. 이름을 지정하고 예약하면 이제부터 이 IP는 VM을 재시작해도 바뀌지 않습니다.

---

## 7. SSH로 VM 접속하기

1. **VM 인스턴스** 목록으로 돌아가서, 방금 만든 VM 행의 **"SSH"** 버튼을 클릭합니다.
2. 브라우저 안에서 새 창(또는 팝업)으로 터미널이 뜹니다. 별도 프로그램 설치나 SSH 키 관리가 전혀 필요 없습니다(GCP가 자동으로 처리).
3. 몇 초 정도 기다리면 `사용자이름@ollies-harvest-vm:~$` 형태의 프롬프트가 나타납니다. 이제부터 이 창에서 명령어를 입력합니다.

> 이후 이 문서의 모든 명령어는 **이 SSH 터미널 안에서** 실행하는 것입니다. (내 컴퓨터 PowerShell이 아닙니다.)

---

## 8. VM 기본 패키지 설치

SSH 터미널에서 순서대로 실행합니다. 먼저, 패키지 업그레이드 중 "어떤 서비스를 재시작할지" 묻는 확인 창이 뜨지 않도록 미리 설정해둡니다(뒤에서 자동으로 재시작하도록 처리).

```bash
echo '$nrconf{restart} = "a";' | sudo tee /etc/needrestart/conf.d/99-autorestart.conf
```

```bash
sudo apt update -o DPkg::Lock::Timeout=300 && sudo apt upgrade -y -o DPkg::Lock::Timeout=300
sudo apt install -y software-properties-common git nginx
```

> **`Could not get lock /var/lib/apt/lists/lock` 에러가 뜨면?** 버그가 아니라 정상적인 현상입니다. VM을 막 만들면 Ubuntu가 부팅 직후 자동으로 백그라운드에서 패키지 목록을 갱신하는 작업(`apt-daily.service`)을 한 번 실행하는데, 그게 끝나기 전에 직접 `apt` 명령을 입력하면 잠금이 걸려 있어서 이 에러가 납니다. 위처럼 `-o DPkg::Lock::Timeout=300` 옵션을 붙이면 잠금이 풀릴 때까지(최대 300초) 자동으로 기다렸다가 진행하므로 이 에러 자체를 피할 수 있습니다. (절대 `/var/lib/apt/lists/lock` 파일을 직접 지우거나 해당 프로세스를 강제 종료하지 마세요 — 패키지 시스템이 깨질 수 있습니다.)
>
> **"Which services should be restarted?" 같은 확인 창이 뜨면?** `needrestart`라는 도구가 "라이브러리가 업데이트됐는데 이 서비스들은 아직 예전 버전을 메모리에 물고 있다, 재시작할까?"라고 묻는 정상적인 안내창입니다. 목록에 나온 서비스(주로 `dbus`, `networkd-dispatcher`, `polkit`, `unattended-upgrades` 등 시스템 기본 서비스)는 전부 재시작해도 SSH 접속이 끊기거나 하지 않으니, 번호를 전부 입력(예: `1 2 3 4`)하고 Enter 하면 됩니다. 위 `needrestart` 설정을 미리 해뒀다면 애초에 이 창 자체가 뜨지 않고 자동으로 재시작까지 처리됩니다.

**Python 3.11 설치 (중요)**: Ubuntu 22.04는 기본 `python3`가 3.10인데, `backend/requirements.txt`의 `websockets==17.0.1`이 Python 3.11 이상을 요구합니다(다른 패키지는 전부 3.10에서도 문제없지만 이 패키지 하나 때문에 3.10에서는 `pip install -r requirements.txt`가 통째로 실패합니다). 그래서 `deadsnakes` PPA로 3.11을 추가로 설치합니다(시스템 기본 `python3`는 그대로 3.10으로 둬도 됩니다 — 아래 venv만 3.11로 만들 것입니다).

```bash
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt update -o DPkg::Lock::Timeout=300
sudo apt install -y python3.11 python3.11-venv
```

설치가 끝나면 버전 확인:

```bash
python3.11 --version   # Python 3.11.x 가 나오면 정상
nginx -v                # nginx version: nginx/1.18.x
git --version
```

---

## 9. 소스코드 내려받기

```bash
sudo mkdir -p /var/www/ollies-harvest
sudo chown -R $USER:$USER /var/www/ollies-harvest
git clone https://github.com/my-space-py/ollies-harvest.git /var/www/ollies-harvest
cd /var/www/ollies-harvest
ls
```

`backend/`, `frontend/`, `GCP.md` 등이 보이면 정상입니다.

> **저장소가 비공개(private)로 바뀐 경우**: 위 `git clone` 명령이 인증 오류로 실패합니다. 이럴 땐 GitHub에서 **Settings → Developer settings → Personal access tokens**로 토큰을 발급받아, `git clone https://<토큰>@github.com/my-space-py/ollies-harvest.git ...` 형태로 클론하거나, VM에서 `ssh-keygen`으로 키를 만들어 저장소의 **Deploy keys**에 공개키를 등록하고 SSH 주소로 클론하는 방법을 쓰세요.

---

## 10. 백엔드(FastAPI) 설정

```bash
cd /var/www/ollies-harvest/backend
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

> venv를 꼭 `python3.11 -m venv venv`로 만드세요. `python3 -m venv venv`(기본 3.10)로 만들면 바로 다음 `pip install -r requirements.txt`에서 `websockets==17.0.1`을 찾지 못해 설치가 통째로 실패하고, 그 결과 `uvicorn`도 설치되지 않습니다(8장의 Python 3.11 설치 안내 참고). 이미 3.10으로 잘못 만들었다면 `deactivate` 후 `rm -rf venv`로 지우고 위 명령을 다시 실행하세요.

설치가 끝나면 한 번 수동으로 실행해서 에러가 없는지 확인합니다.

```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

`Uvicorn running on http://127.0.0.1:8000` 메시지가 뜨면 정상입니다. `Ctrl + C`로 종료하고, 가상환경도 빠져나옵니다.

```bash
deactivate
```

---

## 11. systemd로 백엔드 자동 실행 등록

VM을 재부팅하거나 백엔드 프로세스가 죽어도 자동으로 다시 켜지도록 systemd 서비스로 등록합니다.

```bash
sudo tee /etc/systemd/system/ollies-backend.service > /dev/null <<EOF
[Unit]
Description=Ollie's Harvest FastAPI backend
After=network.target

[Service]
User=$USER
WorkingDirectory=/var/www/ollies-harvest/backend
ExecStart=/var/www/ollies-harvest/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

서비스를 등록하고 바로 실행합니다.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ollies-backend
sudo systemctl status ollies-backend
```

`active (running)` (초록색 글자)이 보이면 성공입니다. `q`를 눌러 상태 화면을 빠져나옵니다.

동작 확인:

```bash
curl http://127.0.0.1:8000/
# {"message":"Auth API가 정상 동작 중입니다."} 가 나오면 정상
```

> 앞으로 백엔드 코드를 수정한 뒤에는 `sudo systemctl restart ollies-backend`로 재시작하면 됩니다. 로그가 궁금하면 `sudo journalctl -u ollies-backend -f` (실시간) 또는 `-e` (최근 로그)를 사용하세요.

---

## 12. Nginx로 프론트엔드 + 백엔드 한 번에 서비스하기

기본 예제 설정을 끄고, 새 설정 파일을 만듭니다.

```bash
sudo rm -f /etc/nginx/sites-enabled/default

sudo tee /etc/nginx/sites-available/ollies-harvest > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    root /var/www/ollies-harvest/frontend;
    index index.html;

    # 프론트엔드 정적 파일 (html/css/js/이미지)
    location / {
        try_files $uri $uri/ =404;
    }

    # 백엔드 API 경로만 골라서 FastAPI(127.0.0.1:8000)로 전달
    location ~ ^/(signup|login|save|leaderboard|friends)(/.*)?$ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/ollies-harvest /etc/nginx/sites-enabled/
```

프론트엔드 정적 파일을 Nginx(`www-data` 사용자)가 읽을 수 있도록 권한을 열어줍니다.

```bash
chmod o+rx /var/www /var/www/ollies-harvest
chmod -R o+rX /var/www/ollies-harvest/frontend
```

설정 문법 검사 후 적용합니다.

```bash
sudo nginx -t
sudo systemctl reload nginx
```

`syntax is ok` / `test is successful` 메시지가 나오면 정상입니다.

---

## 13. 방화벽 확인

5장에서 "HTTP 트래픽 허용"을 체크했다면 이미 포트 80이 열려 있어야 합니다. 확인하는 법:

1. ☰ 메뉴 → **VPC 네트워크** → **방화벽**
2. `default-allow-http` 규칙이 목록에 있고, 포트 `tcp:80`, 소스 범위 `0.0.0.0/0`으로 되어 있으면 정상입니다.
3. 없다면 **"방화벽 규칙 만들기"**로 직접 추가하거나, VM 인스턴스 상세 페이지 → **수정** → 네트워크 태그에 `http-server` 태그가 붙어 있는지 확인하세요(체크박스로 만든 VM은 자동으로 붙습니다).

---

## 14. 접속 테스트

브라우저에서 (SSH 터미널이 아니라 실제 사용할 브라우저에서) 아래 주소로 접속합니다.

```
http://<5장에서 메모한 VM 외부 IP>/
```

- 로그인이 안 되어 있으면 자동으로 `auth.html`로 넘어갑니다.
- 회원가입 → 로그인 → 홈 화면 진입 → 수확/저장까지 실제로 눌러보면서 확인하세요.
- 브라우저 개발자 도구(F12) → Console/Network 탭에 에러가 없는지도 확인하면 좋습니다.

여기까지 되면 배포는 끝난 것입니다. 아래는 선택 사항과 유지보수 방법입니다.

---

## 15. (선택) 도메인 연결 + HTTPS 적용

가지고 있는 도메인이 있다면 붙여서 `https://`로 서비스할 수 있습니다.

1. 도메인 관리 사이트(가비아, Cloudflare 등)에서 **A 레코드**를 6장에서 예약한 VM의 고정 외부 IP로 연결합니다. (전파에 몇 분~1시간 정도 걸릴 수 있습니다.)
2. VM SSH 터미널에서 Certbot 설치:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```
3. 이메일 입력, 약관 동의 후 진행하면 Certbot이 인증서 발급과 Nginx 설정(HTTP→HTTPS 리다이렉트 포함)을 자동으로 해줍니다.
4. 인증서는 90일마다 만료되지만, Certbot이 설치하는 자동 갱신 타이머가 알아서 갱신합니다. 수동 확인:
   ```bash
   sudo certbot renew --dry-run
   ```

---

## 16. 코드 수정 후 다시 배포하는 법 (git pull → 백엔드/Nginx 재시작)

로컬(내 컴퓨터)에서 코드를 고치고 GitHub `main` 브랜치에 푸시한 뒤, VM에 새 코드를 받아 반영하는 순서입니다. **DB(`backend/app.db`)는 `.gitignore` 대상이라 `git pull`로 지워지거나 덮어써지지 않습니다.** 계정·게임 데이터는 그대로 유지됩니다.

### 16.1 한 번에 하기 (복사해서 붙여넣기)

VM의 SSH 창(7장)을 열고 아래를 **통째로** 붙여넣으면 됩니다. 백엔드·프론트엔드 중 무엇을 바꿨든 이대로 실행해도 안전합니다(바뀐 게 없으면 재시작만 한 번 되고 끝).

```bash
cd /var/www/ollies-harvest \
&& git pull origin main \
&& chmod -R o+rX frontend \
&& ./backend/venv/bin/pip install -q -r backend/requirements.txt \
&& sudo systemctl restart ollies-backend \
&& sudo nginx -t && sudo systemctl reload nginx \
&& sleep 2 && sudo systemctl is-active ollies-backend nginx \
&& curl -s http://127.0.0.1:8000/ && echo && echo "배포 완료"
```

마지막에 아래처럼 나오면 성공입니다.

```text
active
active
{"message":"Auth API가 정상 동작 중입니다."}
배포 완료
```

중간에 에러가 나면 `&&` 때문에 그 자리에서 멈춥니다. 어느 줄에서 멈췄는지 보고 16.2의 해당 단계 설명과 16.4를 참고하세요.

### 16.2 단계별로 하기 (무엇을 하는지 이해하면서)

**① 새 코드 받기**

```bash
cd /var/www/ollies-harvest
git status              # "nothing to commit, working tree clean"이면 정상
git pull origin main
git log --oneline -3    # 방금 푸시한 커밋이 맨 위에 보이면 정상
```

이번 풀에서 어떤 파일이 바뀌었는지 보려면:

```bash
git diff --stat HEAD@{1} HEAD
```

**② 새로 생긴 프론트엔드 파일 읽기 권한 주기**

Nginx(`www-data` 사용자)가 새 파일(예: `frontend/js/router.js`)을 읽을 수 있게 12장 권한 명령을 다시 실행합니다. 이미 권한이 있으면 아무 변화도 없으니 매번 실행해도 됩니다.

```bash
chmod -R o+rX /var/www/ollies-harvest/frontend
```

**③ 백엔드 재시작**

`backend/` 코드나 `requirements.txt`가 바뀌었다면 패키지를 맞추고 재시작합니다. (프론트엔드만 바뀐 경우엔 생략해도 되지만, 해도 문제는 없습니다. 재시작하는 1~2초 동안만 API 요청이 실패할 수 있습니다.)

```bash
cd /var/www/ollies-harvest/backend
./venv/bin/pip install -r requirements.txt   # venv 활성화 없이 venv의 pip를 바로 사용
sudo systemctl restart ollies-backend
sudo systemctl status ollies-backend         # active (running) 확인 후 q로 빠져나오기
curl http://127.0.0.1:8000/                  # {"message":"Auth API가 정상 동작 중입니다."}
```

`sudo systemctl status`에 `failed`가 보이면 `sudo journalctl -u ollies-backend -e`로 에러를 확인하세요.

**④ Nginx 반영**

프론트엔드 파일(html/js/css/이미지)은 Nginx가 요청마다 디스크에서 읽기 때문에 **`git pull`만으로 이미 반영**됩니다. Nginx 재시작이 꼭 필요한 건 **Nginx 설정 파일(12장)을 바꿨을 때뿐**입니다. 다만 아래 명령은 접속을 끊지 않고 설정만 다시 읽는 방식(`reload`)이라 매번 해도 안전합니다.

```bash
sudo nginx -t                  # syntax is ok / test is successful
sudo systemctl reload nginx
```

> `reload`는 접속 중인 사용자를 끊지 않습니다. `sudo systemctl restart nginx`는 Nginx를 완전히 껐다 켜는 것으로, `reload`로 해결되지 않을 때만 사용하세요.

**⑤ 브라우저에서 확인**

1. VM 외부 IP(또는 도메인)로 접속 → **Ctrl+F5**(맥은 Cmd+Shift+R)로 강력 새로고침
   - 브라우저가 예전 `index.html`을 캐시해두고 있으면 새 코드가 안 보일 수 있습니다. JS/CSS에는 `?v=숫자`가 붙어 있어서 괜찮지만 `index.html` 자체는 그렇지 않기 때문입니다.
2. 개발자 도구(F12) → Console에 빨간 에러가 없는지 확인

### 16.3 이번 업데이트(SPA 화면 전환 + 비료 지표) 반영 시 확인할 것

이번 변경(`spa 변경`, `비료` 커밋)은 **프론트엔드만** 바뀌었습니다(`frontend/index.html`, `frontend/styles.css`, 새 파일 `frontend/js/router.js`). 따라서 필수 작업은 16.2의 ①②⑤이고, ③④는 해도 되고 안 해도 됩니다. 16.1을 그대로 실행해도 됩니다.

반영 후 SSH에서 새 파일이 제대로 서비스되는지 확인:

```bash
curl -sI http://127.0.0.1/js/router.js | head -1           # HTTP/1.1 200 OK
curl -s http://127.0.0.1/ | grep -c 'router.js'            # 0이 아닌 숫자면 새 index.html이 서비스 중
```

브라우저에서 확인:

- 하단 탭을 누르면 주소가 `/#upgrade`, `/#stats`처럼 바뀌고 화면이 페이드로 전환됨
- 어느 탭에서든 아래로 스크롤해도 다른 창(팝업 목록)이 이어져 보이지 않음
- `/#stats` 상태에서 새로고침해도 통계 화면이 유지되고, 브라우저 뒤로가기로 이전 탭으로 돌아감
- 홈 상단 지표 칸에 보유 쌀알 / 초당 수확량 / 클릭당 수확량 / **비료(부스터)** 4칸이 한 줄로 보임

> 해시(`#` 뒤 부분)는 서버로 전송되지 않으므로, 탭 화면 전환을 위해 Nginx 설정을 바꿀 필요는 없습니다.

### 16.4 pull이 안 될 때

| 메시지 | 원인 / 해결 |
| --- | --- |
| `error: Your local changes to the following files would be overwritten by merge` | VM에서 파일을 직접 고친 적이 있는 경우. VM의 수정 내용이 필요 없다면 `git stash`(따로 보관) 후 다시 `git pull origin main`. 보관한 내용은 `git stash list`로 확인, 필요 없으면 `git stash drop` |
| `fatal: detected dubious ownership in repository` | 폴더 소유자와 현재 사용자가 다름(예: `sudo git clone`으로 받은 경우). `sudo chown -R $USER:$USER /var/www/ollies-harvest` 후 재시도 |
| `Permission denied` (파일 쓰기) | 위와 같은 소유권 문제. 같은 `chown` 명령으로 해결. `git pull` 앞에 `sudo`를 붙이지 마세요(파일 소유자가 root로 바뀌어 다음부터 더 꼬입니다) |
| `Authentication failed` / `Repository not found` | 저장소가 비공개로 바뀐 경우. 9장의 "저장소가 비공개(private)로 바뀐 경우" 참고 |

### 16.5 문제가 생겨서 이전 버전으로 되돌리기

```bash
cd /var/www/ollies-harvest
git log --oneline -10                 # 되돌아갈 커밋 해시 확인 (예: 4b1e8f3)
git checkout 4b1e8f3                  # 해당 버전으로 전환 (DB는 그대로)
sudo systemctl restart ollies-backend
```

문제를 고쳐서 다시 푸시한 뒤에는 최신 버전으로 돌아옵니다:

```bash
git checkout main
git pull origin main
sudo systemctl restart ollies-backend
```

---

## 17. VM을 중지했다가 다시 시작했을 때 (백엔드·프론트엔드 다시 켜기)

GCP 콘솔에서 VM을 **중지 → 시작**하면 VM 안의 프로그램은 모두 꺼졌다가 부팅과 함께 다시 켜집니다. 11장(`systemctl enable --now ollies-backend`)과 8장(Nginx 설치 시 자동 등록)대로 설치했다면 **백엔드(FastAPI)와 프론트엔드(Nginx)는 부팅할 때 자동으로 켜지므로** 보통은 따로 켤 필요가 없습니다. 아래 순서로 **정상인지만 확인**하고, 꺼져 있으면 17.3으로 켜세요.

> 데이터(`backend/app.db`)는 VM 디스크에 남아 있으므로 중지/시작으로 사라지지 않습니다. (VM을 **삭제**한 경우만 사라집니다.)

### 17.1 외부 IP가 바뀌었는지 먼저 확인

6장에서 고정 IP로 바꾸지 않았다면(**임시** IP), VM을 중지했다가 시작하면 **외부 IP가 새로 바뀝니다.** 예전 주소로는 접속되지 않습니다.

1. ☰ 메뉴 → **Compute Engine** → **VM 인스턴스**에서 VM 행의 **외부 IP**를 확인합니다.
2. 앞으로 `http://<새 외부 IP>/`로 접속합니다.
3. 도메인을 연결해 두었다면(15장) 도메인 관리 사이트의 **A 레코드도 새 IP로 바꿔야** 합니다.
4. 매번 바뀌는 게 불편하면 지금 6장대로 **고정 IP로 승격**하세요. 이후로는 중지/시작해도 IP가 그대로입니다.

> 주소(IP)가 바뀌면 브라우저 입장에서는 다른 사이트라서 **다시 로그인**해야 합니다. 게임 진행은 서버(DB)에 저장되어 있으므로 로그인하면 그대로 이어집니다.

### 17.2 한 번에 상태 확인하기 (복사해서 붙여넣기)

7장처럼 VM의 **SSH** 버튼으로 터미널을 열고 아래를 통째로 붙여넣습니다.

```bash
sudo systemctl is-enabled ollies-backend nginx; \
sudo systemctl is-active ollies-backend nginx; \
curl -s http://127.0.0.1:8000/ && echo; \
curl -s -o /dev/null -w "frontend HTTP %{http_code}\n" http://127.0.0.1/auth.html
```

아래처럼 나오면 둘 다 정상 동작 중이고, 브라우저에서 바로 접속하면 됩니다.

```text
enabled
enabled
active
active
{"message":"Auth API가 정상 동작 중입니다."}
frontend HTTP 200
```

- `enabled` = 부팅할 때 자동으로 켜지도록 등록됨
- `active` = 지금 켜져 있음
- `inactive` / `failed`가 보이거나 `curl`이 아무것도 출력하지 않으면 → 17.3
- `Unit ollies-backend.service could not be found`가 나오면 → 백엔드 서비스가 아직 등록되지 않은 것입니다. 11장을 먼저 진행하세요.

### 17.3 꺼져 있으면 켜기

**한 번에 켜기 (백엔드 + 프론트엔드):**

```bash
sudo systemctl enable --now ollies-backend nginx
sleep 2
sudo systemctl is-active ollies-backend nginx
curl -s http://127.0.0.1:8000/ && echo
```

`enable --now`는 "지금 켜고, 다음 부팅부터도 자동으로 켜지게 등록"이라는 뜻입니다. 이미 켜져 있거나 등록되어 있어도 다시 실행해도 괜찮습니다.

**따로따로 켜기 / 다시 시작하기:**

```bash
# 백엔드 (FastAPI, 127.0.0.1:8000)
sudo systemctl start ollies-backend      # 켜기
sudo systemctl restart ollies-backend    # 켜져 있지만 이상할 때 껐다 켜기
sudo systemctl status ollies-backend     # 상태 보기 (q로 빠져나오기)

# 프론트엔드 (Nginx, 80포트 — 정적 파일 + /save 등 API 전달)
sudo nginx -t                            # 설정 검사 (syntax is ok / test is successful)
sudo systemctl start nginx               # 켜기
sudo systemctl restart nginx             # 껐다 켜기
sudo systemctl status nginx
```

> 프론트엔드는 따로 실행하는 서버 프로그램이 없습니다. Nginx가 `frontend/` 폴더의 파일을 그대로 보여주므로, **Nginx가 켜져 있으면 프론트엔드도 켜진 것**입니다. 로컬 개발 때 쓰던 `python3 -m http.server 4174`는 VM에서는 실행하지 않습니다.

### 17.4 그래도 안 켜질 때

| 증상 | 확인할 것 / 해결 |
| --- | --- |
| `ollies-backend`가 `failed` | `sudo journalctl -u ollies-backend -n 30 --no-pager`(최근 30줄)로 에러 확인. `ModuleNotFoundError`면 venv가 깨진 것 → `cd /var/www/ollies-harvest/backend && ./venv/bin/pip install -r requirements.txt`로 패키지를 다시 설치한 뒤 `sudo systemctl restart ollies-backend` |
| 에러 로그에 `address already in use` (8000번) | SSH에서 `uvicorn`을 직접 실행해 둔 프로세스가 남아 있는 경우. `sudo ss -ltnp sport = :8000`으로 `pid=숫자` 확인 → `kill <PID>` → `sudo systemctl restart ollies-backend` |
| `nginx`가 `failed` | `sudo nginx -t`로 설정 오류 줄 번호 확인. `bind() to 0.0.0.0:80 failed`면 다른 프로그램(apache2 등)이 80번을 쓰는 중 → `sudo ss -ltnp sport = :80`으로 확인 후 그 서비스를 `sudo systemctl disable --now apache2` |
| 둘 다 `active`인데 브라우저에서 안 열림 | 17.1의 **새 외부 IP**로 접속했는지 확인. 13장 방화벽(`default-allow-http`)과 VM의 `http-server` 네트워크 태그 확인 |
| 브라우저에 `502 Bad Gateway` | Nginx는 켜졌지만 백엔드가 꺼진 상태. 위 `ollies-backend` 항목대로 확인 |
| 로그인은 되는데 진행이 안 보임 | 주소(IP/도메인)가 바뀌어 예전 브라우저 로그인 정보가 없는 경우. 같은 계정으로 다시 로그인하면 서버 저장본을 불러옵니다. 데이터 확인: `ls -l /var/www/ollies-harvest/backend/app.db` (파일이 있고 크기가 0이 아니면 정상) |

### 17.5 (참고) VM을 중지하기 전에

- 특별히 할 일은 없습니다. 게임은 자동 저장되고, 서버는 SQLite 파일에 바로 기록합니다.
- 다만 중요한 데이터가 쌓였다면 중지 전에 DB 파일을 복사해 두면 안전합니다.

```bash
cp /var/www/ollies-harvest/backend/app.db ~/app.db.$(date +%Y%m%d-%H%M).bak
ls -l ~/app.db.*.bak
```

---

## 18. 문제 해결(트러블슈팅)

| 증상 | 확인할 것 |
| --- | --- |
| `uvicorn: command not found` 또는 `uvicorn` 실행이 안 됨 | venv를 `python3.11`이 아니라 `python3`(3.10)로 만들었을 가능성이 높습니다. `pip install -r requirements.txt` 출력을 위로 스크롤해서 `websockets` 관련 에러(`No matching distribution found`)가 있었는지 확인 → 있었다면 10장 안내대로 `rm -rf venv` 후 `python3.11 -m venv venv`로 다시 만드세요 |
| 브라우저에 `502 Bad Gateway` | 백엔드가 안 떠 있는 상태. `sudo systemctl status ollies-backend`로 확인 → 죽어있으면 `sudo journalctl -u ollies-backend -e`로 에러 로그 확인 |
| 로그인/회원가입 시 "서버에 연결할 수 없습니다" | Nginx 설정의 정규식 경로(`location ~ ^/(signup|login|...)`)가 실제 요청 경로와 맞는지, `sudo nginx -t` 통과했는지, `sudo systemctl reload nginx` 했는지 확인 |
| 이미지/CSS는 안 뜨는데 글자만 나옴 | `chmod -R o+rX /var/www/ollies-harvest/frontend` 를 다시 실행 (권한 문제) |
| 사이트 자체가 안 열림(타임아웃) | 13장 방화벽 규칙(포트 80) 확인. `sudo ufw status`로 Ubuntu 자체 방화벽이 켜져 있는지도 확인(비활성 상태가 기본값) |
| VM 재부팅(중지 후 시작) 후 사이트가 안 뜸 | 17장 참고 — 외부 IP 변경 여부 확인 후 `sudo systemctl enable --now ollies-backend nginx` |
| 데이터가 재부팅 후 사라짐 | SQLite 파일(`backend/app.db`)은 VM 디스크에 그대로 남아있습니다 — 이 증상이면 VM 자체를 삭제 후 재생성한 경우일 가능성이 높습니다(디스크를 유지한 게 아니라면 데이터도 함께 사라짐) |

---

## 19. 비용 안내 및 절약 팁

- **Always Free 조건** (5장에서 `us-central1`/`us-west1`/`us-east1`을 선택했다면 아래가 매달 무료로 적용됩니다):
  - `e2-micro` 인스턴스 1대(계정당, 위 3개 리전 중 하나에서 실행 시)
  - 표준 영구 디스크 30GB까지
  - 매달 아웃바운드(egress) 트래픽 1GB까지(중국/호주 제외)
- 위 무료 한도를 벗어나지만 않으면(예: 서울 리전을 쓰지 않고, VM을 추가로 늘리지 않는다면) 이 가이드대로 운영 시 **월 비용이 거의 0원**입니다.
- 그래도 걱정된다면 예산 알림을 걸어두세요: ☰ 메뉴 → **결제** → **예산 및 알림** → 예산 만들기(예: 월 $5 초과 시 이메일 알림).
- 당분간 서비스를 쓰지 않을 예정이면 VM 인스턴스 목록에서 **"중지"**를 눌러두면 컴퓨팅 요금이 발생하지 않습니다(단, 디스크 보관 요금은 계속 소액 발생 — Always Free 한도 안이면 이마저도 무료). 완전히 정리하려면 VM을 **삭제**하세요(이 경우 SQLite 데이터도 함께 사라지니 주의).

---

## 20. 이 구조의 한계 (알아두면 좋은 점)

- SQLite는 VM 디스크에 파일로 저장됩니다. 트래픽이 많아지거나 VM을 여러 대로 늘리는 시점이 오면(이 프로젝트의 현재 범위를 넘어서는 확장) PostgreSQL 같은 별도 관리형 DB로 옮기는 것을 고려해야 합니다. 지금 같은 프로토타입/소규모 서비스 단계에서는 SQLite로 충분합니다.
- 백업이 별도로 설정되어 있지 않습니다. 중요한 데이터가 쌓이면 VM 인스턴스의 **스냅샷** 기능(Compute Engine → 스냅샷 → 스냅샷 만들기)으로 주기적으로 디스크를 백업해두는 것을 권장합니다.
