# 백엔드 개발 환경 구성 가이드

이 문서는 `backend/` 폴더에서 FastAPI + SQLite 기반 서버를 개발하기 위한 환경 구성 방법을 처음부터 순서대로 안내합니다. Windows PowerShell 기준으로 작성되었습니다.

## 1. Python 설치 확인

먼저 Python이 설치되어 있는지 확인합니다.

```powershell
python --version
```

`Python 3.x.x` 형태로 버전이 출력되면 정상입니다. 만약 명령을 찾을 수 없다면 [python.org](https://www.python.org/downloads/)에서 Python을 설치한 뒤 다시 확인합니다.

## 2. 가상환경(venv) 생성

가상환경은 프로젝트마다 독립된 패키지 공간을 만들어주는 기능입니다. 다른 프로젝트와 패키지 버전이 충돌하는 것을 막아줍니다.

`backend` 폴더로 이동한 뒤 가상환경을 생성합니다.

```powershell
cd backend
python -m venv venv
```

명령이 끝나면 `backend/venv` 폴더가 생성됩니다. 이 폴더가 가상환경 본체이며, Git에는 올리지 않습니다(이미 `.gitignore`에 등록되어 있습니다).

## 3. 가상환경 활성화

가상환경을 만들었다고 자동으로 사용되는 것은 아닙니다. 작업을 시작할 때마다 아래 명령으로 **활성화**해야 합니다.

```powershell
.\venv\Scripts\Activate.ps1
```

활성화에 성공하면 터미널 프롬프트 앞에 `(venv)`가 표시됩니다.

```text
(venv) PS C:\...\backend>
```

> **참고: 스크립트 실행 오류가 날 경우**
> PowerShell 보안 정책 때문에 다음과 같은 오류가 날 수 있습니다.
>
> ```text
> venv\Scripts\Activate.ps1 파일을 로드할 수 없습니다. ...
> ```
>
> 이 경우 아래 명령을 한 번 실행해 현재 사용자에 한해 스크립트 실행을 허용한 뒤 다시 활성화합니다.
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

Git Bash를 사용한다면 아래 명령으로 활성화합니다.

```bash
source venv/Scripts/activate
```

## 4. 패키지 설치 (pip install)

가상환경이 활성화된 상태(`(venv)`가 보이는 상태)에서 `requirements.txt`에 정리된 패키지를 한 번에 설치합니다.

```powershell
pip install -r requirements.txt
```

이 프로젝트의 `requirements.txt`에는 다음과 같은 핵심 패키지가 포함되어 있습니다.

| 패키지 | 역할 |
| --- | --- |
| `fastapi` | 웹 API 서버 프레임워크 |
| `uvicorn` | FastAPI 앱을 실행하는 서버 |
| `sqlalchemy` | 파이썬 코드로 SQLite 등 DB를 다루는 ORM 라이브러리 |
| `pydantic` | 요청/응답 데이터의 형식을 검증하는 라이브러리 |

> SQLite는 별도의 설치나 서버 실행이 필요 없습니다. Python 표준 라이브러리(`sqlite3`)에 내장되어 있어, DB 파일 하나만으로 동작합니다.

## 5. 새 패키지를 추가로 설치했다면

개발하다가 새로운 패키지가 필요해 설치했다면(`pip install 패키지이름`), 아래 명령으로 `requirements.txt`를 최신 상태로 갱신합니다.

```powershell
pip freeze > requirements.txt
```

다른 팀원은 이 파일만 받아서 `pip install -r requirements.txt`를 실행하면 동일한 개발 환경을 그대로 구성할 수 있습니다.

## 6. 서버 실행 (FastAPI 앱 작성 후)

`backend/main.py`에 FastAPI 앱을 작성했다면(예: `app = FastAPI()`), 아래 명령으로 개발 서버를 실행합니다.

```powershell
uvicorn main:app --reload
```

- `main:app` : `main.py` 파일 안의 `app` 객체를 실행하라는 의미입니다.
- `--reload` : 코드를 수정하면 서버가 자동으로 재시작됩니다(개발 중에만 사용).

서버가 실행되면 아래 주소에서 확인할 수 있습니다.

- API 서버: http://127.0.0.1:8000
- 자동 생성된 API 문서(Swagger UI): http://127.0.0.1:8000/docs

## 7. 작업을 마칠 때: 가상환경 비활성화

작업이 끝나면 아래 명령으로 가상환경을 빠져나옵니다.

```powershell
deactivate
```

## 전체 흐름 요약

```text
1. cd backend
2. python -m venv venv                (최초 1회만)
3. .\venv\Scripts\Activate.ps1        (작업 시작할 때마다)
4. pip install -r requirements.txt    (최초 1회, 또는 패키지 목록이 바뀌었을 때)
5. uvicorn main:app --reload          (개발 서버 실행)
6. deactivate                         (작업 종료 시)
```
