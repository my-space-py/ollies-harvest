const API_BASE_URL = "http://127.0.0.1:8000";

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const authMessage = document.getElementById("authMessage");
const showSignupLink = document.getElementById("showSignup");
const showLoginLink = document.getElementById("showLogin");

function showMessage(text) {
  authMessage.textContent = text;
}

// 로그인 <-> 회원가입 폼 전환
function showForm(target) {
  authMessage.textContent = "";
  if (target === "signup") {
    signupForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
  } else {
    loginForm.classList.remove("hidden");
    signupForm.classList.add("hidden");
  }
}

showSignupLink.addEventListener("click", (e) => {
  e.preventDefault();
  showForm("signup");
});

showLoginLink.addEventListener("click", (e) => {
  e.preventDefault();
  showForm("login");
});

// 로그인 성공 시 사용자 정보를 localStorage에 저장하고 홈으로 이동
function saveSessionAndRedirect(user) {
  localStorage.setItem("currentUser", JSON.stringify(user));
  window.location.href = "index.html";
}

// 로그인 처리
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage("");

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    const res = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showMessage(data.detail || "로그인에 실패했습니다.");
      return;
    }

    saveSessionAndRedirect(data);
  } catch (err) {
    showMessage("서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인해주세요.");
  }
});

// 회원가입 처리
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage("");

  const nickname = document.getElementById("signupNickname").value.trim();
  const username = document.getElementById("signupUsername").value.trim();
  const password = document.getElementById("signupPassword").value;

  try {
    const res = await fetch(`${API_BASE_URL}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showMessage(data.detail || "회원가입에 실패했습니다.");
      return;
    }

    // 회원가입 성공 -> 로그인 폼으로 전환 (자동 로그인하지 않음)
    signupForm.reset();
    showForm("login");
    showMessage("회원가입이 완료되었습니다. 로그인해주세요.");
  } catch (err) {
    showMessage("서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인해주세요.");
  }
});
