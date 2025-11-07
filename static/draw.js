// draw.js（固定500x500／VA軸=黒／VAミニマップHiDPI／縦軸ラベル微調整
// ／送信後3秒モーダル／10秒想像→OK解放／進捗は本試行のみ表示(0-10)／120fpsサンプリング
// ／トラップ1回を含む合計送信11回：本試行10回 + トラップ1回
// ／localStorageは参加者IDで名前空間化／10回終了時は必ずtrap表示）
(() => {
  // ====== ルーティング前提チェック ======
  const participantId = localStorage.getItem("participant_id");
  const consented     = localStorage.getItem("consented") === "true";
  const howtoDone     = localStorage.getItem("howto_done") === "true";
  if (!consented)     { location.replace("/consent?from=draw"); return; }
  if (!participantId) { location.replace("/profile?from=draw"); return; }
  if (!howtoDone)     { location.replace("/howto?from=draw");   return; }

  // ★ 参加者IDで名前空間化
  const K = (k) => `${participantId}:${k}`;
  const legacyKeys = ['trial_count','submit_count','trap_slot','trap_done'];

  // ====== 要素参照 ======
  const canvas  = document.getElementById("drawingCanvas");
  if (!canvas) { console.error("drawingCanvas not found"); return; }
  const ctx     = canvas.getContext("2d", { willReadFrequently: true });

  const elVal      = document.getElementById("valence");
  const elAro      = document.getElementById("arousal");
  const elValDesc  = document.getElementById("valence-desc");
  const elAroDesc  = document.getElementById("arousal-desc");
  const elProgress = document.getElementById("progress");

  const topMapCanvas   = document.getElementById("vaMapTop");
  const focusMapCanvas = document.getElementById("vaMapFocus");

  const focusModal = document.getElementById("focusModal") || document.getElementById("focusOverlay");
  const fVal       = document.getElementById("f-val")      || document.getElementById("fv-val");
  const fAro       = document.getElementById("f-aro")      || document.getElementById("fv-aro");
  const fValDesc   = document.getElementById("f-val-desc") || document.getElementById("fv-val-desc");
  const fAroDesc   = document.getElementById("f-aro-desc") || document.getElementById("fv-aro-desc");
  const fTitle     = document.getElementById("focusTitle") || (focusModal ? focusModal.querySelector(".modal__body h3, .modal__head h3") : null);
  const focusOkBtn = document.getElementById("focusOkBtn");

  const doneModal  = document.getElementById("doneModal");
  const doneText   = document.getElementById("doneText");

  const progressPill = elProgress ? elProgress.closest(".pill") : null;
  const valuesPills = [fVal, fAro, fValDesc, fAroDesc].map(el => el ? el.closest(".pill") || el : null);

  // ====== Const ======
  const MAX_REAL_TRIALS = 10;   // 本試行目標数
  const TOTAL_SUBMITS   = 11;   // 送信合計（10 + trap1）
  const BETWEEN_TRIAL_WAIT_MS = 3000;
  const FOCUS_SECONDS = 10;

  // ====== State ======
  let drawing = false;
  let canDraw = false;
  let points = [];
  let currentValence = null;
  let currentArousal = null;
  let submitting = false;
  let focusUnlockTimer = null;

  // 名前空間キーのget/set
  const getN = (k) => parseInt(localStorage.getItem(K(k)) || "0", 10);
  const setN = (k, v) => localStorage.setItem(K(k), String(v));
  const getS = (k) => localStorage.getItem(K(k));
  const setS = (k, v) => localStorage.setItem(K(k), v);
  const delK = (k) => localStorage.removeItem(K(k));

  // 旧キー → 新キーへ移行（新キー未設定の時のみ）
  (function migrateLegacy(){
    let migrated = false;
    const legacy = {
      trial_count:  parseInt(localStorage.getItem('trial_count')  || '0', 10),
      submit_count: parseInt(localStorage.getItem('submit_count') || '0', 10),
      trap_slot:    localStorage.getItem('trap_slot'),
      trap_done:    localStorage.getItem('trap_done')
    };
    if (!localStorage.getItem(K('trial_count'))  && legacy.trial_count)  { setN('trial_count',  legacy.trial_count);  migrated = true; }
    if (!localStorage.getItem(K('submit_count')) && legacy.submit_count) { setN('submit_count', legacy.submit_count); migrated = true; }
    if (!localStorage.getItem(K('trap_slot'))    && legacy.trap_slot)    { setS('trap_slot',    legacy.trap_slot);    migrated = true; }
    if (!localStorage.getItem(K('trap_done'))    && legacy.trap_done)    { setS('trap_done',    legacy.trap_done);    migrated = true; }
    if (migrated) legacyKeys.forEach(k => localStorage.removeItem(k));
  })();

  let realCount   = getN('trial_count');   // 本試行の完了数（0..10）
  let submitCount = getN('submit_count');  // 送信合計数（0..11）

  // ====== Trap Utilities ======
  const TRAP_KEY_SLOT = 'trap_slot'; // 1..11
  const TRAP_KEY_DONE = 'trap_done'; // "true" で消化済
  const isTrapPending = () => getS(TRAP_KEY_DONE) !== "true";

  function getTrapSlot() {
    const v = parseInt(getS(TRAP_KEY_SLOT) || "0", 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  function setTrapSlot(n) { setS(TRAP_KEY_SLOT, String(n)); }

  function ensureTrapSlot() {
    if (!isTrapPending()) return null;
    let slot = getTrapSlot();
    // 次送信（submitCount+1）〜 TOTAL_SUBMITS の範囲に必ず割当て
    const minSlot = Math.min(TOTAL_SUBMITS, Math.max(1, submitCount + 1));
    const maxSlot = TOTAL_SUBMITS;
    const needReseed = !(Number.isInteger(slot) && slot >= minSlot && slot <= maxSlot);
    if (needReseed) {
      const span = (maxSlot - minSlot + 1);
      slot = minSlot + Math.floor(Math.random() * span); // [minSlot, TOTAL_SUBMITS]
      setTrapSlot(slot);
    }
    return slot;
  }

  function isTrapNow() {
    const slot = getTrapSlot();
    return isTrapPending() && (submitCount + 1 === slot);
  }

  // ====== 不整合の自己修復 ======
  (function repairIfWeird() {
    let changed = false;

    // 範囲補正
    if (realCount < 0 || realCount > MAX_REAL_TRIALS) { realCount = Math.max(0, Math.min(MAX_REAL_TRIALS, realCount)); setN('trial_count', realCount); changed = true; }
    if (submitCount < 0 || submitCount > TOTAL_SUBMITS){ submitCount = Math.max(0, Math.min(TOTAL_SUBMITS, submitCount)); setN('submit_count', submitCount); changed = true; }

    // 他参加者からtrap_doneを誤継承していた疑い → クリア
    if (getS(TRAP_KEY_DONE) === "true" && submitCount < TOTAL_SUBMITS && realCount < MAX_REAL_TRIALS) {
      delK(TRAP_KEY_DONE);
      delK(TRAP_KEY_SLOT);
      changed = true;
    }

    // 本試行10回が終わっていてtrap未消化 → slotを11に固定（必ず最後に出す）
    if (realCount >= MAX_REAL_TRIALS && isTrapPending()) {
      setTrapSlot(TOTAL_SUBMITS); // = 11
      changed = true;
    }

    if (changed) {
      setN('trial_count',  realCount);
      setN('submit_count', submitCount);
    }
  })();

  // ====== 表示ユーティリティ ======
  const valenceDesc = v =>
    v <= -7 ? "とても不快" : v <= -3 ? "やや不快" :
    v <=  3 ? "中立"       : v <=  7 ? "やや快"   : "とても快";

  const arousalDesc = a =>
    a <= -7 ? "とても静か" : a <= -3 ? "やや静か" :
    a <=  3 ? "普通"       : a <=  7 ? "やや活発" : "とても活発";

  function updateProgress() {
    if (elProgress) elProgress.textContent = `${realCount}/${MAX_REAL_TRIALS} 完了`;
  }

  function isAllDone() {
    // 本試行10回終了 ＆ trap消化済
    return (realCount >= MAX_REAL_TRIALS) && !isTrapPending();
  }

  function setDrawingState(on){
    if (progressPill) progressPill.style.visibility = on ? "hidden" : "";
  }

  function drawDecor() {
    // 固定 500x500
    if (!drawing) {
      if (canvas.width !== 500)  canvas.width  = 500;
      if (canvas.height !== 500) canvas.height = 500;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2563eb';
    ctx.strokeRect(1.5, 1.5, canvas.width-3, canvas.height-3);
    ctx.restore();
  }

  // ====== VAミニマップ ======
  function setupHiDPICanvas(cvs, cssW, cssH){
    const dpr = window.devicePixelRatio || 1;
    cvs.style.width  = cssW + "px";
    cvs.style.height = cssH + "px";
    cvs.width  = Math.round(cssW * dpr);
    cvs.height = Math.round(cssH * dpr);
    const c = cvs.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  function drawVAMap(cvs, v, a, { showPoint = true } = {}){
    if (!cvs || typeof v !== "number" || typeof a !== "number") return;

    const cssW = cvs.clientWidth  || 260;
    const cssH = cvs.clientHeight || 220;
    const c = setupHiDPICanvas(cvs, cssW, cssH);

    const PAD_L = 60, PAD_R = 16, PAD_T = 16, PAD_B = 46;
    const x0 = PAD_L, y0 = PAD_T;
    const plotW = cssW - PAD_L - PAD_R;
    const plotH = cssH - PAD_T - PAD_B;

    c.clearRect(0,0,cssW,cssH);
    c.fillStyle = "#fff";
    c.fillRect(0,0,cssW,cssH);

    // 外枠
    c.strokeStyle = "#cfcfd6";
    c.lineWidth = 1;
    c.strokeRect(x0, y0, plotW, plotH);

    // 中央の十字軸（黒）
    const xMid = x0 + plotW/2, yMid = y0 + plotH/2;
    c.strokeStyle = "#000";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(xMid, y0);      c.lineTo(xMid, y0 + plotH);
    c.moveTo(x0,  yMid);     c.lineTo(x0 + plotW, yMid);
    c.stroke();

    // 軸ラベル
    c.fillStyle = "#111827";
    c.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Noto Sans JP, sans-serif";
    c.textAlign = "center"; c.textBaseline = "top";
    c.fillText("Valence（快↔不快）", x0 + plotW/2, y0 + plotH + 18);

    const Y_AXIS_X = 30;
    c.save();
    c.translate(Y_AXIS_X, y0 + plotH/2);
    c.rotate(-Math.PI/2);
    c.textAlign = "center"; c.textBaseline = "bottom";
    c.fillText("Arousal（鎮静↔活発）", 0, 0);
    c.restore();

    // 象限ラベル
    c.fillStyle = "#6b7280";
    c.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Noto Sans JP, sans-serif";
    c.textAlign = "left";  c.textBaseline = "top";
    c.fillText("不快・活発", x0 + 6, y0 + 6);
    c.textAlign = "right";
    c.fillText("快・活発", x0 + plotW - 6, y0 + 6);
    c.textAlign = "left";  c.textBaseline = "bottom";
    c.fillText("不快・静穏", x0 + 6, y0 + plotH - 6);
    c.textAlign = "right";
    c.fillText("快・静穏", x0 + plotW - 6, y0 + plotH - 6);

    if (!showPoint) return;

    // 値の点
    const nx = (v + 10) / 20;
    const ny = (a + 10) / 20;
    const px = x0 + nx * plotW;
    const py = y0 + (1 - ny) * plotH;

    c.beginPath();
    c.fillStyle = "rgba(59,130,246,0.18)";
    c.arc(px, py, 11, 0, Math.PI*2);
    c.fill();

    c.beginPath();
    c.fillStyle = "#2563eb";
    c.arc(px, py, 6, 0, Math.PI*2);
    c.fill();

    c.fillStyle = "#111827";
    c.font = "13px system-ui, -apple-system, Segoe UI, Roboto, Noto Sans JP, sans-serif";
    c.textAlign = "left";
    c.textBaseline = "alphabetic";
    c.fillText(`V:${v}  A:${a}`, Math.min(px + 10, x0 + plotW - 40), Math.max(py - 10, 12));
  }

  function redrawVAMaps(showPointForFocus = true){
    if (typeof currentValence === "number" && typeof currentArousal === "number"){
      drawVAMap(topMapCanvas, currentValence, currentArousal, { showPoint: true });
      drawVAMap(focusMapCanvas, currentValence, currentArousal, { showPoint: showPointForFocus });
    }
  }

  // ====== サーバからお題取得 ======
  async function fetchTask() {
    const res = await fetch("/task");
    if (!res.ok) throw new Error("task failed");
    const data = await res.json();
    currentValence = data.valence;
    currentArousal = data.arousal;

    elVal.textContent     = currentValence;
    elAro.textContent     = currentArousal;
    elValDesc.textContent = `（${valenceDesc(currentValence)}）`;
    elAroDesc.textContent = `（${arousalDesc(currentArousal)}）`;

    redrawVAMaps(true);
    return data;
  }

  // ====== 10秒イメージ → OKで描画解放 ======
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
      if (mode === "trap") {
        fTitle.innerHTML = "<strong>今回は何も描かずに『送信』を押してください</strong>";
        focusModal?.classList.add("is-trap");
      } else {
        fTitle.textContent = "今回のお題";
        focusModal?.classList.remove("is-trap");
      }
    }

    if (mode === "trap") {
      elVal.textContent     = "—";
      elAro.textContent     = "—";
      elValDesc.textContent = "";
      elAroDesc.textContent = "";
    } else {
      elVal.textContent     = currentValence;
      elAro.textContent     = currentArousal;
      elValDesc.textContent = `（${valenceDesc(currentValence)}）`;
      elAroDesc.textContent = `（${arousalDesc(currentArousal)}）`;
    }

    redrawVAMaps(mode !== "trap");

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

  focusOkBtn?.addEventListener('click', () => {
    if (focusOkBtn.disabled) return;
    if (focusUnlockTimer) { clearTimeout(focusUnlockTimer); focusUnlockTimer = null; }
    focusModal?.setAttribute("aria-hidden", "true");
    canDraw = true;
    disableActionButtons(false);
  });

  function disableActionButtons(disabled) {
    ["submitBtn", "clearBtn", "newTaskBtn"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    });
  }

  async function prepareNewTask() {
    ensureTrapSlot();
    clearCanvas(true);
    try {
      // —— 重要：10回終了後で trap 未消化なら fetch をスキップして trap を強制表示
      if (realCount >= MAX_REAL_TRIALS && isTrapPending()) {
        showFocusOverlay(FOCUS_SECONDS, "trap");
        return;
      }
      // 通常：サーバからお題取得
      await fetchTask();
      showFocusOverlay(FOCUS_SECONDS, isTrapNow() ? "trap" : "normal");
    } catch {
      alert("お題の取得に失敗しました");
      disableActionButtons(false);
    }
  }

  // ====== 送信処理 ======
  async function submitDrawing() {
    if (submitting) return;

    if (isAllDone()) { location.href = "/thanks"; return; }

    const trap = isTrapNow();

    // trap以外ではお題が必須
    if (!trap && (currentValence === null || currentArousal === null)) {
      alert("お題が未取得です");
      return;
    }
    // 本試行の最低描画長さチェック
    if (!trap && points.length < 3) {
      alert("もっとしっかり円を描いてください");
      return;
    }

    // 送信ペイロード
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
      trial_index: trap ? null : (realCount + 1), // 本試行のみ連番
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

      // カウント更新（名前空間キー）
      submitCount += 1; setN('submit_count', submitCount);
      if (trap) {
        setS(TRAP_KEY_DONE, "true");
      } else {
        realCount += 1; setN('trial_count', realCount);
      }
      updateProgress();

      // 成功モーダル
      if (doneModal && doneText) {
        doneText.textContent = `${realCount}/${MAX_REAL_TRIALS} 完了しました`;
        doneModal.setAttribute("aria-hidden", "false");

        const sub = doneModal.querySelector('.modal__body .small.dim');
        if (sub) {
          if (isAllDone()) {
            sub.textContent = "全10回が完了しました。終了画面へ移動します…";
          } else if (realCount >= MAX_REAL_TRIALS && isTrapPending()) {
            sub.textContent = "トラップ確認を準備しています…";
          } else {
            sub.textContent = "次のお題を準備しています…";
          }
        }
      }

      if (isAllDone()) {
        setTimeout(() => { location.href = "/thanks"; }, BETWEEN_TRIAL_WAIT_MS);
        return;
      }

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

  // ====== 座標補正 ======
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

  // ====== ★ Pointer Events + 120fps サンプラ ======
  const SAMPLE_HZ = 120;
  const SAMPLE_DT = 1000 / SAMPLE_HZ; // ≒8.33ms
  let sampling = false;
  let lastSampleTime = 0;

  // 現在ポインタ状態
  const curPtr = { active:false, x:0, y:0, pressure:null };

  function addSample(nowTs) {
    if (!curPtr.active) return;
    points.push({
      x: curPtr.x,
      y: curPtr.y,
      t: nowTs,
      pressure: curPtr.pressure ?? null,
    });
  }

  function sampleLoop(ts) {
    if (!sampling) return;
    if (ts - lastSampleTime >= SAMPLE_DT) {
      while (ts - lastSampleTime >= SAMPLE_DT) {
        lastSampleTime += SAMPLE_DT;
        addSample(lastSampleTime);
      }
    }
    requestAnimationFrame(sampleLoop);
  }

  function startSampling() {
    if (sampling) return;
    sampling = true;
    lastSampleTime = performance.now();
    addSample(lastSampleTime);
    requestAnimationFrame(sampleLoop);
  }

  function stopSampling() {
    sampling = false;
  }

  function updatePointerFromEvent(e) {
    const p = toCanvasCoords(e.clientX, e.clientY);
    curPtr.x = p.x;
    curPtr.y = p.y;
    curPtr.pressure = (typeof e.pressure === 'number' ? e.pressure : null);
  }

  // ---- Pointer Events（マウス/タッチ両対応）----
  canvas.addEventListener('pointerdown', (e) => {
    if (!canDraw) return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);

    drawing = true;
    points = [];
    setDrawingState(true);

    ctx.beginPath();
    refreshRectCache();

    updatePointerFromEvent(e);
    ctx.moveTo(curPtr.x, curPtr.y);

    curPtr.active = true;
    startSampling(); // ★ 120fps記録開始
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drawing || !canDraw) return;
    updatePointerFromEvent(e);
    ctx.lineTo(curPtr.x, curPtr.y);
    ctx.stroke();
  });

  function endStrokeCommon(e) {
    drawing = false;
    setDrawingState(false);
    curPtr.active = false;
    stopSampling();
    try { canvas.releasePointerCapture?.(e.pointerId); } catch(_) {}
  }

  canvas.addEventListener('pointerup',     endStrokeCommon);
  canvas.addEventListener('pointercancel', endStrokeCommon);
  canvas.addEventListener('pointerleave',  () => {
    if (drawing) {
      drawing = false;
      setDrawingState(false);
      curPtr.active = false;
      stopSampling();
    }
  });

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
    canvas.width = 500;
    canvas.height = 500;

    if (isAllDone()) { alert("全10回の提出が完了しています。ご協力ありがとうございます。"); location.href = "/thanks"; return; }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;

    drawDecor();
    refreshRectCache();
    updateProgress();

    ensureTrapSlot(); // ← 残り区間から必ず決まる
    await prepareNewTask();

    function onResize(){
      if (!drawing) { drawDecor(); refreshRectCache(); }
      const focusOpen = focusModal && focusModal.getAttribute("aria-hidden") === "false";
      redrawVAMaps(!isTrapNow() && !focusOpen ? true : (focusOpen ? (isTrapNow() ? false : true) : true));
    }
    window.addEventListener('orientationchange', onResize);
    window.addEventListener('resize',           onResize);
    window.addEventListener('scroll',           ()=> { if (!drawing) { refreshRectCache(); } });
  })();
})();
