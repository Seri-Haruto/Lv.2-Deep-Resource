(() => {
  const canvas  = document.getElementById("drawingCanvas");
  const ctx     = canvas.getContext("2d", { willReadFrequently: true });

  const elIdInput = document.getElementById("participantId");
  const elIdStat  = document.getElementById("idStatus");
  const elVal     = document.getElementById("valence");
  const elAro     = document.getElementById("arousal");
  const elValDesc = document.getElementById("valence-desc");
  const elAroDesc = document.getElementById("arousal-desc");

  // Buttons
  const on = (id, evt, fn) => document.getElementById(id).addEventListener(evt, fn);
  on("issueBtn","click", issueId);
  on("setIdBtn","click", setId);
  on("newTaskBtn","click", async () => { clearCanvas(true); try{ await fetchTask(); }catch{ alert("お題の取得に失敗しました．"); } });
  on("clearBtn","click", () => clearCanvas(true));
  on("submitBtn","click", submitDrawing);

  // State
  let drawing = false;
  let points = [];
  let participantId = null;
  let currentValence = null;
  let currentArousal = null;

  // Utils
  const validId = id => /^[A-Za-z0-9]{6,16}$/.test(id);
  const updateIdStatus = () => elIdStat.textContent = participantId ? `ID: ${participantId}（設定済み）` : '未設定';

  const valenceDesc = v =>
    v <= -7 ? "とても不快" :
    v <= -3 ? "やや不快"  :
    v <=  3 ? "中立"      :
    v <=  7 ? "やや快"    : "とても快";

  const arousalDesc = a =>
    a <= -7 ? "とても静か / 眠そう" :
    a <= -3 ? "やや静か"           :
    a <=  3 ? "普通"               :
    a <=  7 ? "やや活発"           : "とても活発 / 興奮";

  // 青い外枠のみ（キャンバス内の視覚ガイド）
  function drawDecor() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2563eb';
    ctx.strokeRect(1.5, 1.5, canvas.width-3, canvas.height-3);
    ctx.restore();
  }

  // API
  async function issueId() {
    try {
      const res = await fetch("/issue_id");
      if (!res.ok) throw new Error("issue_id failed");
      const data = await res.json();
      participantId = data.id;
      localStorage.setItem("participant_id", participantId);
      elIdInput.value = participantId;
      updateIdStatus();
      alert("IDを発行しました．必ず控えてください．");
    } catch {
      alert("ID発行に失敗しました．接続を確認してください．");
    }
  }
  function setId() {
    const id = (elIdInput.value || "").trim();
    if (!validId(id)) { alert("英数字6〜16桁で入力してください．"); return; }
    participantId = id;
    localStorage.setItem("participant_id", participantId);
    updateIdStatus();
    alert("IDを設定しました．");
  }
  async function fetchTask() {
    const res = await fetch("/task");
    if (!res.ok) throw new Error("task failed");
    const data = await res.json();
    currentValence = data.valence;
    currentArousal = data.arousal;
    elVal.textContent = currentValence;
    elAro.textContent = currentArousal;
    elValDesc.textContent = `（${valenceDesc(currentValence)}）`;
    elAroDesc.textContent = `（${arousalDesc(currentArousal)}）`;
  }
  async function submitDrawing() {
    if (!participantId || !validId(participantId)) { alert("参加者IDが未設定です．"); return; }
    if (currentValence === null || currentArousal === null) { alert("お題が未取得です．"); return; }
    if (points.length < 3) { alert("もう少し円を描いてください！"); return; }

    const res = await fetch("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: participantId, valence: currentValence, arousal: currentArousal, points })
    });
    if (!res.ok) { alert("送信に失敗しました．"); return; }
    alert("送信しました！ 同じIDで続けて提出できます．");
    clearCanvas(true);
    try { await fetchTask(); } catch {}
  }

  // Canvas
  function getMousePos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function getTouchPos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function clearCanvas(withDecor=false) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    points = [];
    if (withDecor) drawDecor();
  }

  // Mouse
  canvas.addEventListener("mousedown", e => {
    drawing = true; points = [];
    ctx.beginPath();
    const p = getMousePos(e); ctx.moveTo(p.x, p.y); points.push(p);
  });
  canvas.addEventListener("mousemove", e => {
    if (!drawing) return;
    const p = getMousePos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); points.push(p);
  });
  canvas.addEventListener("mouseup", () => drawing = false);
  canvas.addEventListener("mouseleave", () => drawing = false);

  // Touch
  canvas.addEventListener("touchstart", e => {
    e.preventDefault();
    drawing = true; points = [];
    ctx.beginPath();
    const p = getTouchPos(e); ctx.moveTo(p.x, p.y); points.push(p);
  }, { passive:false });
  canvas.addEventListener("touchmove", e => {
    e.preventDefault();
    if (!drawing) return;
    const p = getTouchPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); points.push(p);
  }, { passive:false });
  canvas.addEventListener("touchend", () => { drawing = false; });

  // Init
  (async function init(){
    // 既存 or URLクエリのIDを採用。無ければ自動発行
    const params = new URLSearchParams(location.search);
    const qid = params.get("id");
    const saved = localStorage.getItem("participant_id");
    if (qid && validId(qid)) {
      participantId = qid; elIdInput.value = participantId; localStorage.setItem("participant_id", participantId);
    } else if (saved && validId(saved)) {
      participantId = saved; elIdInput.value = participantId;
    } else {
      try { await issueId(); } catch {}
    }
    updateIdStatus();

    drawDecor();
    try { await fetchTask(); } catch { alert("お題の取得に失敗しました．"); }

    // 画面回転/サイズ変更で枠再描画（ユーザ描画は消さない）
    window.addEventListener('orientationchange', ()=> drawDecor());
    window.addEventListener('resize', ()=> drawDecor());
  })();
})();
