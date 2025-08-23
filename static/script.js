// DOM
const canvas = document.getElementById("drawingCanvas");
const ctx = canvas.getContext("2d");
const penSize = document.getElementById("penSize");
const valenceSlider = document.getElementById("valence");
const arousalSlider = document.getElementById("arousal");
const valenceValue = document.getElementById("valence-value");
const arousalValue = document.getElementById("arousal-value");
const clearBtn = document.getElementById("clearBtn");
const submitBtn = document.getElementById("submitBtn");
const issueIdBtn = document.getElementById("issueIdBtn");
const taskBtn = document.getElementById("taskBtn");
const copyIdBtn = document.getElementById("copyIdBtn");
const exportLink = document.getElementById("exportLink");
const userIdInput = document.getElementById("userId");
const idHelp = document.getElementById("idHelp");
const toastEl = document.getElementById("toast");

// State
let drawing = false;
let points = []; // {x,y,t,color,w,m}
let color = "#111";
let width = parseInt(penSize.value, 10);

// Retina + responsive
function fitCanvas() {
  const ratio = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(320, Math.floor(rect.width));
  const h = Math.floor(w * (560 / 880));
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  canvas.style.height = `${h}px`;
  canvas.style.width = `${w}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  redraw();
}
window.addEventListener("resize", fitCanvas);
setTimeout(fitCanvas, 0);

// Toolbar
penSize.addEventListener("input", () => (width = parseInt(penSize.value, 10)));
document.querySelectorAll(".color").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".color").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    color = btn.dataset.color;
  });
});

// Labels
function syncLabels() {
  valenceValue.textContent = valenceSlider.value;
  arousalValue.textContent = arousalSlider.value;
}
valenceSlider.addEventListener("input", syncLabels);
arousalSlider.addEventListener("input", syncLabels);
syncLabels();

// Pointer events
function getPos(e) {
  const rect = canvas.getBoundingClientRect();

  // 画面上の座標（タッチにも対応）
  const clientX = e.clientX ?? (e.touches && e.touches[0].clientX);
  const clientY = e.clientY ?? (e.touches && e.touches[0].clientY);

  // 表示サイズ → キャンバス内部座標へ変換係数
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}


function beginStroke(evt) {
  drawing = true;
  const p = getPos(evt);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  points.push({ x: p.x, y: p.y, t: Date.now(), color, w: width, m: true });
}

function drawStroke(evt) {
  if (!drawing) return;
  const p = getPos(evt);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  points.push({ x: p.x, y: p.y, t: Date.now(), color, w: width });
}

function endStroke() {
  drawing = false;
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  beginStroke(e);
});
canvas.addEventListener("pointermove", drawStroke);
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);

// Redraw (for resize)
function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!points.length) return;
  let lastStyle = {};
  for (const p of points) {
    if (p.m || p.color !== lastStyle.color || p.w !== lastStyle.w) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.w;
      lastStyle = { color: p.color, w: p.w };
    } else {
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }
}

// Clear
clearBtn.addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  points = [];
});

// ID
const ID_RE = /^[A-Za-z0-9]{6,16}$/;

issueIdBtn.addEventListener("click", async () => {
  try {
    const res = await fetch("/issue_id");
    const { id } = await res.json();
    userIdInput.value = id;
    idHelp.textContent = "発行しました。保存しておいてください。";
    idHelp.style.color = "var(--ok)";
    updateExportLink();
    toast("ID を発行しました");
  } catch {
    toast("ID 発行に失敗しました", "error");
  }
});

copyIdBtn.addEventListener("click", async () => {
  if (!userIdInput.value) return;
  await navigator.clipboard.writeText(userIdInput.value);
  toast("ID をコピーしました");
});

userIdInput.addEventListener("input", () => {
  if (!userIdInput.value) {
    idHelp.textContent = "";
  } else if (ID_RE.test(userIdInput.value)) {
    idHelp.textContent = "OK";
    idHelp.style.color = "var(--ok)";
  } else {
    idHelp.textContent = "英数字6〜16桁で入力してください";
    idHelp.style.color = "var(--warn)";
  }
  updateExportLink();
});

function updateExportLink() {
  const id = userIdInput.value.trim();
  exportLink.href = id && ID_RE.test(id) ? `/export?user_id=${encodeURIComponent(id)}` : "/export";
}
updateExportLink();

// Task (V/A)
taskBtn.addEventListener("click", async () => {
  try {
    const res = await fetch("/task");
    const data = await res.json();
    valenceSlider.value = data.valence;
    arousalSlider.value = data.arousal;
    syncLabels();
    toast(`お題: V ${data.valence}, A ${data.arousal}`);
  } catch {
    toast("お題取得に失敗しました", "error");
  }
});

// Submit
submitBtn.addEventListener("click", async () => {
  if (points.length < 3) {
    toast("もう少しぐるぐるを描いてください！", "warn");
    return;
  }
  const user_id = userIdInput.value.trim();
  if (!ID_RE.test(user_id)) {
    toast("参加者IDが不正です（英数字6〜16桁）", "warn");
    return;
  }

  const payload = {
    user_id,
    valence: Number(valenceSlider.value),
    arousal: Number(arousalSlider.value),
    points
  };

  try {
    const res = await fetch("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("submit failed");
    toast("送信しました！");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    points = [];
  } catch {
    toast("送信に失敗しました", "error");
  }
});

// Toast
function toast(msg, type = "info") {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  toastEl.style.borderColor =
    type === "error" ? "var(--danger)" : type === "warn" ? "var(--warn)" : "rgba(255,255,255,.12)";
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 2200);
}
