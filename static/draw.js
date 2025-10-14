// draw.js（送信後3秒の中央モーダル＋10秒想像→OK解放＋進捗は完了数表示）

(() => {
  const canvas  = document.getElementById("drawingCanvas");
  const ctx     = canvas.getContext("2d", { willReadFrequently: true });

  const elVal     = document.getElementById("valence");
  const elAro     = document.getElementById("arousal");
  const elValDesc = document.getElementById("valence-desc");
  const elAroDesc = document.getElementById("arousal-desc");
  const elProgress= document.getElementById("progress");

  // フォーカス用
  const focusModal = document.getElementById("focusModal") || document.getElementById("focusOverlay");
  const fVal       = document.getElementById("f-val")     || document.getElementById("fv-val");
  const fAro       = document.getElementById("f-aro")     || document.getElementById("fv-aro");
  const fValDesc   = document.getElementById("f-val-desc")|| document.getElementById("fv-val-desc");
  const fAroDesc   = document.getElementById("f-aro-desc")|| document.getElementById("fv-aro-desc");
  const fTitle     = document.getElementById("focusTitle") || (focusModal ? focusModal.querySelector(".modal__body h3, .modal__head h3") : null);
  const focusOkBtn = document.getElementById("focusOkBtn");

  // 送信後中央表示（3秒）
  const doneModal  = document.getElementById("doneModal");
  const doneText   = document.getElementById("doneText");

  // 描画中は進捗ピルを隠す
  const progressPill = elProgress ? elProgress.closest(".pill") : null;

  const valuesPills = [fVal, fAro, fValDesc, fAroDesc].map(el => el ? el.closest(".pill") || el : null);

  const participantId = localStorage.getItem("participant_id");
  const consented = localStorage.getItem("consented") === "true";
  if (!consented)    { location.href = "/consent?from=draw"; }
  if (!participantId){ location.href = "/profile?from=draw"; }

  // ====== State / Const ======
  let drawing = false;
  let canDraw = false;
  let points = [];
  let currentValence = null;
  let currentArousal = null;
  let trialCount = parseInt(localStorage.getItem("trial_count") || "0", 10);
  const MAX_TRIALS = 10;
  const BETWEEN_TRIAL_WAIT_MS = 3000; // ★ 送信後のインターバル3秒
  const FOCUS_SECONDS = 10;
  let focusUnlockTimer = null;
  let submitting = false;

  // トラップ（1回だけ「何も描かずに送信」）
  const TRAP_KEY_INDEX = "trap_trial_index";
  const TRAP_KEY_DONE  = "trap_done";
  const isTrapPending  = () => localStorage.getItem(TRAP_KEY_DONE) !== "true";
  const nextTrialNumber= () => trialCount + 1;
  const getTrapIndex   = () => parseInt(localStorage.getItem(TRAP_KEY_INDEX) || "0", 10);
  const setTrapIndex   = (n) => localStorage.setItem(TRAP_KEY_INDEX, String(n));
  function ensureTrapIndex() {
    if (!isTrapPending()) return null;
    const next = nextTrialNumber();
    let idx = getTrapIndex();
    if (!(idx >= next && idx <= MAX_TRIALS)) {
      const span = MAX_TRIALS - next + 1;
      if (span <= 0) return null;
      idx = Math.floor(Math.random() * span) + next;
      setTrapIndex(idx);
    }
    return idx;
  }
  const isTrapNow = () => isTrapPending() && (nextTrialNumber() === getTrapIndex());

  // ====== Utils ======
  const valenceDesc = v =>
    v <= -7 ? "とても不快" : v <= -3 ? "やや不快"  :
    v <=  3 ? "中立"      : v <=  7 ? "やや快"    : "とても快";

  const arousalDesc = a =>
    a <= -7 ? "とても静か" : a <= -3 ? "やや静か"   :
    a <=  3 ? "普通"       : a <=  7 ? "やや活発"   : "とても活発";

  function updateProgress(){
    // 完了数で表示（例：3/10 完了）
    elProgress.textContent = `${trialCount}/${MAX_TRIALS} 完了`;
  }

  function setDrawingState(on){
    if (progressPill) progressPill.style.visibility = on ? "hidden" : "";
  }

  function drawDecor() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const needResize = canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr);
    if (needResize && !drawing) {
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
    elVal.textContent = currentValence;
    elAro.textContent = currentArousal;
    elValDesc.textContent = `（${valenceDesc(currentValence)}）`;
    elAroDesc.textContent = `（${arousalDesc(currentArousal)}）`;
    return data;
  }

  // 10秒イメージ → OKで描画解放
  function showFocusOverlay(seconds = FOCUS_SECONDS, mode = "normal") {
    if (focusUnlockTimer) { clearTimeout(focusUnlockTimer); focusUnlockTimer = null; }

    const showValues = (mode !== "trap");
    [fVal, fAro, fValDesc, fAroDesc].forEach(el => { if (el) el.textContent = ""; });
    if (showValues) {
      if (fVal)     fVal.textContent     = currentValence;
      if (fAro)     fAro.textContent     = currentArousal;
      if (fValDesc) fValDesc.textContent = `（${valenceDesc(currentValence)}）`;
      if (fAroDesc) fAroDesc.textContent = `（${arousalDesc(currentArousal)}）`;
    }
    valuesPills.forEach(node => { if (node) node.style.display = showValues ? "" : "none"; });

    if (fTitle) {
      fTitle.textContent = (mode === "trap")
        ? "今回は何も描かずに『送信』を押してください"
        : "今回のお題";
    }

    if (mode === "trap") {
      elVal.textContent     = "—";
      elAro.textContent     = "—";
      elValDesc.textContent = "（今回は何も描かずに送信）";
      elAroDesc.textContent = "";
    }

    canDraw = false;
    disableActionButtons(true);
    if (focusModal) focusModal.setAttribute("aria-hidden", "false");
    if (focusOkBtn) {
      focusOkBtn.disabled = true;
      focusOkBtn.classList.add('is-wait');
      focusOkBtn.setAttribute('aria-disabled', 'true');
    }

    focusUnlockTimer = setTimeout(() => {
      if (focusOkBtn) {
        focusOkBtn.disabled = false;
        focusOkBtn.classList.remove('is-wait');
        focusOkBtn.removeAttribute('aria-disabled');
        focusOkBtn.focus?.();
      }
    }, seconds * 1000);
  }

  if (focusOkBtn) {
    focusOkBtn.addEventListener('click', () => {
      if (focusOkBtn.disabled) return;
      if (focusUnlockTimer) { clearTimeout(focusUnlockTimer); focusUnlockTimer = null; }
      if (focusModal) focusModal.setAttribute("aria-hidden", "true");
      canDraw = true;
      disableActionButtons(false);
    });
  }

  function disableActionButtons(disabled) {
    ["submitBtn", "clearBtn", "newTaskBtn"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    });
  }

  async function prepareNewTask() {
    ensureTrapIndex();
    clearCanvas(true);
    try {
      await fetchTask();
      showFocusOverlay(FOCUS_SECONDS, isTrapNow() ? "trap" : "normal");
    } catch {
      alert("お題の取得に失敗しました");
      disableActionButtons(false);
    }
  }

  async function submitDrawing() {
    if (submitting) return;
    if (trialCount >= MAX_TRIALS) { alert("全10回が完了しています。"); location.href = "/thanks"; return; }
    if (currentValence === null || currentArousal === null) { alert("お題が未取得です"); return; }

    const trap = isTrapNow();
    if (!trap && points.length < 3) { alert("もっとしっかり円を描いてください"); return; }

    // トラップマーキング
    let payloadPoints;
    if (trap) {
      const passed = points.length < 3;
      payloadPoints = passed
        ? [{x:-1,y:-1,trap:true,trap_result:"pass"},{x:-1,y:-1},{x:-1,y:-1}]
        : (()=>{ const arr = points.slice(); if (arr.length) arr[0] = {...arr[0], trap:true, trap_result:"fail"}; return arr; })();
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
      document.getElementById("submitBtn")?.setAttribute("disabled","true");

      const res = await fetch("/submit", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("submit failed");
      const data = await res.json();
      if (data.status !== "success") throw new Error("submit error");

      if (trap) localStorage.setItem(TRAP_KEY_DONE, "true");

      // 完了数を進める
      trialCount += 1;
      localStorage.setItem("trial_count", String(trialCount));
      updateProgress();

      // ★ 中央モーダルで3秒表示
      if (doneModal && doneText) {
        doneText.textContent = `${trialCount}/${MAX_TRIALS} 完了しました`;
        doneModal.setAttribute("aria-hidden", "false");
      }

      // 全完了なら 3 秒後にThanksへ
      if (trialCount >= MAX_TRIALS) {
        setTimeout(() => { location.href = "/thanks"; }, BETWEEN_TRIAL_WAIT_MS);
        return;
      }

      // 3秒の余白 → 次のお題（10秒フォーカス）
      disableActionButtons(true);
      setDrawingState(false);
      setTimeout(async () => {
        if (doneModal) doneModal.setAttribute("aria-hidden", "true");
        await prepareNewTask();
      }, BETWEEN_TRIAL_WAIT_MS);

    } catch (e) {
      alert(`送信に失敗しました。通信状況をご確認の上，再度お試しください。\n(${e?.message ?? "unknown error"})`);
    } finally {
      submitting = false;
      document.getElementById("submitBtn")?.removeAttribute("disabled");
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
    setDrawingState(true);
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
  canvas.addEventListener("mouseup", () => { drawing = false; setDrawingState(false); });
  canvas.addEventListener("mouseleave", () => { drawing = false; setDrawingState(false); });

  canvas.addEventListener("touchstart", e => {
    if (!canDraw) return;
    e.preventDefault();
    drawing = true; points = [];
    setDrawingState(true);
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
  canvas.addEventListener("touchend", () => { drawing = false; setDrawingState(false); });

  // ====== Buttons ======
  document.getElementById("newTaskBtn")?.addEventListener("click", prepareNewTask);
  document.getElementById("clearBtn")?.addEventListener("click", () => clearCanvas(true));
  document.getElementById("submitBtn")?.addEventListener("click", submitDrawing);

  // ====== モーダル（実験方法） ======
  const howtoBtn = document.getElementById("howtoBtn");
  const howtoModal = document.getElementById("howtoModal");
  const howtoClose = document.getElementById("howtoClose");
  const howtoBackdrop = document.getElementById("howtoBackdrop");
  function openHowto(){
    if (howtoModal) {
      howtoModal.setAttribute("aria-hidden", "false");
      document.getElementById("howtoClose")?.focus();
    }
  }
  function closeHowto(){ howtoModal?.setAttribute("aria-hidden", "true"); }
  howtoBtn?.addEventListener("click", openHowto);
  howtoClose?.addEventListener("click", closeHowto);
  howtoBackdrop?.addEventListener("click", closeHowto);
  window.addEventListener("keydown", (e)=>{ if(e.key === "Escape") closeHowto(); });

  // ====== Init ======
  (async function init(){
    if (trialCount >= MAX_TRIALS) { alert("全10回の提出が完了しています。ご協力ありがとうございます。"); location.href = "/thanks"; return; }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;

    drawDecor();
    refreshRectCache();
    updateProgress();

    ensureTrapIndex();
    await prepareNewTask(); // 初回も10秒フォーカス（トラップかも）

    window.addEventListener('orientationchange', ()=> { if (!drawing) { drawDecor(); refreshRectCache(); } });
    window.addEventListener('resize',           ()=> { if (!drawing) { drawDecor(); refreshRectCache(); } });
    window.addEventListener('scroll',           ()=> { if (!drawing) { refreshRectCache(); } });
  })();
})();
