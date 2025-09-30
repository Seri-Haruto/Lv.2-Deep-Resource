// draw.js (fixed)

(() => {
  const canvas  = document.getElementById("drawingCanvas");
  const ctx     = canvas.getContext("2d", { willReadFrequently: true });

  const elVal     = document.getElementById("valence");
  const elAro     = document.getElementById("arousal");
  const elValDesc = document.getElementById("valence-desc");
  const elAroDesc = document.getElementById("arousal-desc");
  const elProgress= document.getElementById("progress");

  // フォーカス用要素（既存モーダルを流用）
  const focusModal = document.getElementById("focusModal") || document.getElementById("focusOverlay");
  const fVal       = document.getElementById("f-val")     || document.getElementById("fv-val");
  const fAro       = document.getElementById("f-aro")     || document.getElementById("fv-aro");
  const fValDesc   = document.getElementById("f-val-desc")|| document.getElementById("fv-val-desc");
  const fAroDesc   = document.getElementById("f-aro-desc")|| document.getElementById("fv-aro-desc");
  const fCountdown = document.getElementById("focusCountdown"); // 無ければ未使用
  const fTitle     = document.getElementById("focusTitle") || (focusModal ? focusModal.querySelector(".modal__head h3") : null);
  const valuesPills = [fVal, fAro, fValDesc, fAroDesc].map(el => el ? el.closest(".pill") || el : null);

  const participantId = localStorage.getItem("participant_id");
  const consented = localStorage.getItem("consented") === "true";

  if (!consented) { location.href = "/consent?from=draw"; }
  if (!participantId) { location.href = "/profile?from=draw"; }

  // ====== State ======
  let drawing = false;
  let canDraw = false;
  let points = [];
  let currentValence = null;
  let currentArousal = null;
  let trialCount = parseInt(localStorage.getItem("trial_count") || "0", 10);
  const MAX_TRIALS = 10;
  let countdownTimer = null;
  let submitting = false; // 二重送信防止

  // ★ トラップ管理キー
  const TRAP_KEY_INDEX = "trap_trial_index"; // 1..MAX_TRIALS のどこか
  const TRAP_KEY_DONE  = "trap_done";        // "true" なら消化済み

  // ====== Trap helpers ======
  const isTrapPending = () => localStorage.getItem(TRAP_KEY_DONE) !== "true";
  const nextTrialNumber = () => trialCount + 1;
  const getTrapIndex = () => parseInt(localStorage.getItem(TRAP_KEY_INDEX) || "0", 10);
  const setTrapIndex = (n) => localStorage.setItem(TRAP_KEY_INDEX, String(n));

  // ★ 残り回の中でトラップ回を必ず保証する
  function ensureTrapIndex() {
    if (!isTrapPending()) return null; // 既に消化済み
    const next = nextTrialNumber();
    let idx = getTrapIndex();

    // 未設定 / 範囲外 / 既に過ぎた番号 → 再設定
    if (!(idx >= next && idx <= MAX_TRIALS)) {
      const span = MAX_TRIALS - next + 1;
      if (span <= 0) return null; // 残り無し
      idx = Math.floor(Math.random() * span) + next; // [next .. MAX_TRIALS]
      setTrapIndex(idx);
    }
    return idx;
  }

  const isTrapNow = () => isTrapPending() && (nextTrialNumber() === getTrapIndex());

  // ====== Utils ======
  const valenceDesc = v =>
    v <= -7 ? "とても不快" :
    v <= -3 ? "やや不快"  :
    v <=  3 ? "中立"      :
    v <=  7 ? "やや快"    : "とても快";

  const arousalDesc = a =>
    a <= -7 ? "とても静か" :
    a <= -3 ? "やや静か"   :
    a <=  3 ? "普通"       :
    a <=  7 ? "やや活発"   : "とても活発";

  function updateProgress(){
    elProgress.textContent = `${trialCount}/${MAX_TRIALS}`;
  }

  function drawDecor() {
    // DPRに合わせて内部解像度を調整
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const needResize = canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr);
    if (needResize && !drawing) { // 描き中は破壊的変更を避ける
      canvas.width  = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2563eb';
    ctx.strokeRect(1.5, 1.5, canvas.width-3, canvas.height-3);
    ctx.restore();
  }

  async function fetchTask() {
    const res = await fetch("/task");
    if (!res.ok) throw new Error("task failed");
    const data = await res.json();
    currentValence = data.valence;
    currentArousal = data.arousal;

    // 上部バーを更新（トラップ時は後で上書き）
    elVal.textContent = currentValence;
    elAro.textContent = currentArousal;
    elValDesc.textContent = `（${valenceDesc(currentValence)}）`;
    elAroDesc.textContent = `（${arousalDesc(currentArousal)}）`;

    return data;
  }

  // ★ 5秒だけフォーカス（通常 or トラップ）
  function showFocusOverlay(seconds = 5, mode = "normal") {
    // 値・説明を反映/表示切替
    const showValues = (mode !== "trap");
    [fVal, fAro, fValDesc, fAroDesc].forEach(el => { if (el) el.textContent = ""; });
    if (showValues) {
      if (fVal)     fVal.textContent     = currentValence;
      if (fAro)     fAro.textContent     = currentArousal;
      if (fValDesc) fValDesc.textContent = `（${valenceDesc(currentValence)}）`;
      if (fAroDesc) fAroDesc.textContent = `（${arousalDesc(currentArousal)}）`;
    }
    valuesPills.forEach(node => { if (node) node.style.display = showValues ? "" : "none"; });

    // タイトル
    if (fTitle) {
      fTitle.textContent = (mode === "trap")
        ? "今回は何も描かずに『送信』を押してください"
        : "今回のお題";
    }

    // 上部バーもトラップ表示に（視線誘導）
    if (mode === "trap") {
      elVal.textContent = "—";
      elAro.textContent = "—";
      elValDesc.textContent = "（今回は何も描かずに送信）";
      elAroDesc.textContent = "";
    }

    // 描画不可・ボタン無効化・オーバーレイ表示
    canDraw = false;
    disableActionButtons(true);
    if (focusModal) focusModal.setAttribute("aria-hidden", "false");

    // カウントダウン（要素があれば表示）
    if (countdownTimer) clearInterval(countdownTimer);
    if (fCountdown) {
      let remain = seconds;
      fCountdown.textContent = String(remain);
      countdownTimer = setInterval(() => {
        remain -= 1;
        fCountdown.textContent = String(remain);
        if (remain <= 0) {
          clearInterval(countdownTimer);
          countdownTimer = null;
          if (focusModal) focusModal.setAttribute("aria-hidden", "true");
          canDraw = true;
          disableActionButtons(false);
        }
      }, 1000);
    } else {
      // カウントダウン要素が無いレイアウト向け
      setTimeout(() => {
        if (focusModal) focusModal.setAttribute("aria-hidden", "true");
        canDraw = true;
        disableActionButtons(false);
      }, seconds * 1000);
    }
  }

  function disableActionButtons(disabled) {
    const ids = ["submitBtn", "clearBtn", "newTaskBtn"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    });
  }

  async function prepareNewTask() {
    // ★ 残り回の中でトラップ回を保証（ここで毎回）
    ensureTrapIndex();

    clearCanvas(true);
    try {
      await fetchTask();
      showFocusOverlay(5, isTrapNow() ? "trap" : "normal");
    } catch {
      alert("お題の取得に失敗しました");
      disableActionButtons(false);
    }
  }

  async function submitDrawing() {
    if (submitting) return; // 二重送信ガード

    if (trialCount >= MAX_TRIALS) {
      alert("すでに全10回が完了しています。");
      location.href = "/thanks";
      return;
    }
    if (currentValence === null || currentArousal === null) { alert("お題が未取得です"); return; }

    const trap = isTrapNow();
    // 通常時はしっかり描いてもらう
    if (!trap && points.length < 3) { alert("もっとしっかり円を描いてください"); return; }

    // ★ トラップの評価と保存用マーキング（サーバ互換：-1ダミー点）
    let payloadPoints;
    if (trap) {
      const passed = points.length < 3; // 何も描かなかった（またはほぼ0）
      if (passed) {
        // 空送信だとサーバに弾かれる想定→ダミー3点＋フラグ
        payloadPoints = [
          {x:-1, y:-1, trap:true, trap_result:"pass"},
          {x:-1, y:-1}, {x:-1, y:-1}
        ];
      } else {
        // 実描画の先頭点にフラグを付与
        payloadPoints = points.slice();
        if (payloadPoints.length) payloadPoints[0] = { ...payloadPoints[0], trap:true, trap_result:"fail" };
      }
    } else {
      payloadPoints = points;
    }

    const payload = {
      user_id: participantId,
      valence: currentValence,
      arousal: currentArousal,
      trial_index: trialCount + 1,
      points: payloadPoints
    };

    try {
      submitting = true;
      const submitBtn = document.getElementById("submitBtn");
      if (submitBtn) submitBtn.disabled = true;

      const res = await fetch("/submit", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("submit failed");
      const data = await res.json();
      if (data.status !== "success") throw new Error("submit error");

      // トラップを消化済みに
      if (trap) localStorage.setItem(TRAP_KEY_DONE, "true");

      trialCount += 1;
      localStorage.setItem("trial_count", String(trialCount));
      updateProgress();

      if (trialCount >= MAX_TRIALS) {
        alert("全10回の提出が完了しました。ご協力ありがとうございます。");
        location.href = "/thanks";
        return;
      }

      await prepareNewTask();
    } catch (e) {
      alert(`送信に失敗しました。通信状況をご確認の上，再度お試しください。\n(${e?.message ?? "unknown error"})`);
    } finally {
      submitting = false;
      const submitBtn = document.getElementById("submitBtn");
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  // ====== 座標補正（高頻度計算の最適化） ======
  let rectCache = null;
  let scaleX = 1, scaleY = 1;

  function refreshRectCache() {
    const r = canvas.getBoundingClientRect();
    rectCache = r;
    scaleX = canvas.width  / r.width;
    scaleY = canvas.height / r.height;
  }

  function toCanvasCoords(clientX, clientY){
    if (!rectCache) refreshRectCache();
    return { x: (clientX - rectCache.left) * scaleX, y: (clientY - rectCache.top) * scaleY };
  }

  function clearCanvas(withDecor=false) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    points = [];
    if (withDecor) drawDecor();
  }

  // ====== Mouse / Touch ======
  canvas.addEventListener("mousedown", e => {
    if (!canDraw) return;
    drawing = true; points = [];
    ctx.beginPath();
    refreshRectCache();
    const p = toCanvasCoords(e.clientX, e.clientY);
    ctx.moveTo(p.x, p.y); points.push({x:p.x, y:p.y});
  });
  canvas.addEventListener("mousemove", e => {
    if (!drawing || !canDraw) return;
    const p = toCanvasCoords(e.clientX, e.clientY);
    ctx.lineTo(p.x, p.y); ctx.stroke(); points.push({x:p.x, y:p.y});
  });
  canvas.addEventListener("mouseup", () => drawing = false);
  canvas.addEventListener("mouseleave", () => drawing = false);

  canvas.addEventListener("touchstart", e => {
    if (!canDraw) return;
    e.preventDefault();
    drawing = true; points = [];
    ctx.beginPath();
    refreshRectCache();
    const t = e.touches[0];
    const p = toCanvasCoords(t.clientX, t.clientY);
    ctx.moveTo(p.x, p.y); points.push({x:p.x, y:p.y});
  }, { passive:false });
  canvas.addEventListener("touchmove", e => {
    if (!canDraw) return;
    e.preventDefault();
    if (!drawing) return;
    const t = e.touches[0];
    const p = toCanvasCoords(t.clientX, t.clientY);
    ctx.lineTo(p.x, p.y); ctx.stroke(); points.push({x:p.x, y:p.y});
  }, { passive:false });
  canvas.addEventListener("touchend", () => { drawing = false; });

  // ====== Buttons ======
  document.getElementById("newTaskBtn").addEventListener("click", prepareNewTask);
  document.getElementById("clearBtn").addEventListener("click", () => clearCanvas(true));
  document.getElementById("submitBtn").addEventListener("click", submitDrawing);

  // ====== モーダル（実験方法） ======
  const howtoBtn = document.getElementById("howtoBtn");
  const howtoModal = document.getElementById("howtoModal");
  const howtoClose = document.getElementById("howtoClose");
  const howtoBackdrop = document.getElementById("howtoBackdrop");

  function openHowto(){ if (howtoModal) { howtoModal.setAttribute("aria-hidden", "false"); const btn = document.getElementById("howtoClose"); btn && btn.focus(); } }
  function closeHowto(){ if (howtoModal) howtoModal.setAttribute("aria-hidden", "true"); }

  if (howtoBtn) howtoBtn.addEventListener("click", openHowto);
  if (howtoClose) howtoClose.addEventListener("click", closeHowto);
  if (howtoBackdrop) howtoBackdrop.addEventListener("click", closeHowto);
  window.addEventListener("keydown", (e)=>{ if(e.key === "Escape") closeHowto(); });

  // ====== Init ======
  (async function init(){
    // 10回完了済なら即thanksへ
    if (trialCount >= MAX_TRIALS) {
      alert("全10回の提出が完了しています。ご協力ありがとうございます。");
      location.href = "/thanks";
      return;
    }

    // ペン見た目
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;

    drawDecor();
    refreshRectCache();
    updateProgress();

    // ★ 初回起動時にも必ず保証
    ensureTrapIndex();

    await prepareNewTask(); // 初回も5秒フォーカス（トラップかも）

    window.addEventListener('orientationchange', ()=> { if (!drawing) { drawDecor(); refreshRectCache(); } });
    window.addEventListener('resize', ()=> { if (!drawing) { drawDecor(); refreshRectCache(); } });
    window.addEventListener('scroll', ()=> { if (!drawing) { refreshRectCache(); } });
  })();
})();
