(() => {
  const canvas  = document.getElementById("drawingCanvas");
  const ctx     = canvas.getContext("2d", { willReadFrequently: true });

  const elVal     = document.getElementById("valence");
  const elAro     = document.getElementById("arousal");
  const elValDesc = document.getElementById("valence-desc");
  const elAroDesc = document.getElementById("arousal-desc");
  const elProgress= document.getElementById("progress");

  const participantId = localStorage.getItem("participant_id");
  const consented = localStorage.getItem("consented") === "true";

  if (!consented) { location.href = "/consent"; }
  if (!participantId) { location.href = "/profile"; }

  // ====== State ======
  let drawing = false;
  let points = [];
  let currentValence = null;
  let currentArousal = null;
  let trialCount = parseInt(localStorage.getItem("trial_count") || "0", 10);
  const MAX_TRIALS = 10;

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

  function drawDecor() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2563eb';
    ctx.strokeRect(1.5, 1.5, canvas.width-3, canvas.height-3);
    ctx.restore();
  }

  function updateProgress(){
    elProgress.textContent = `${trialCount}/${MAX_TRIALS}`;
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
    if (trialCount >= MAX_TRIALS) {
      alert("すでに全10回が完了しています。");
      location.href = "/thanks";
      return;
    }
    if (currentValence === null || currentArousal === null) { alert("お題が未取得です"); return; }
    if (points.length < 3) { alert("もっとしっかり円を描いてください"); return; }

    const payload = {
      user_id: participantId,
      valence: currentValence,
      arousal: currentArousal,
      trial_index: trialCount + 1,
      points
    };

    try {
      const res = await fetch("/submit", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("submit failed");
      const data = await res.json();
      if (data.status !== "success") throw new Error("submit error");

      trialCount += 1;
      localStorage.setItem("trial_count", String(trialCount));
      updateProgress();

      if (trialCount >= MAX_TRIALS) {
        alert("全10回の提出が完了しました。ご協力ありがとうございます。");
        location.href = "/thanks";
        return;
      }

      clearCanvas(true);
      try { await fetchTask(); } catch {}
    } catch {
      alert("送信に失敗しました。通信状況をご確認の上、再度お試しください。");
    }
  }

  // ====== 座標補正 ======
  function toCanvasCoords(clientX, clientY){
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width  / r.width;
    const sy = canvas.height / r.height;
    return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
  }
  function clearCanvas(withDecor=false) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    points = [];
    if (withDecor) drawDecor();
  }

  // ====== Mouse / Touch ======
  canvas.addEventListener("mousedown", e => {
    drawing = true; points = [];
    ctx.beginPath();
    const p = toCanvasCoords(e.clientX, e.clientY);
    ctx.moveTo(p.x, p.y); points.push({x:p.x, y:p.y});
  });
  canvas.addEventListener("mousemove", e => {
    if (!drawing) return;
    const p = toCanvasCoords(e.clientX, e.clientY);
    ctx.lineTo(p.x, p.y); ctx.stroke(); points.push({x:p.x, y:p.y});
  });
  canvas.addEventListener("mouseup", () => drawing = false);
  canvas.addEventListener("mouseleave", () => drawing = false);

  canvas.addEventListener("touchstart", e => {
    e.preventDefault();
    drawing = true; points = [];
    ctx.beginPath();
    const t = e.touches[0];
    const p = toCanvasCoords(t.clientX, t.clientY);
    ctx.moveTo(p.x, p.y); points.push({x:p.x, y:p.y});
  }, { passive:false });
  canvas.addEventListener("touchmove", e => {
    e.preventDefault();
    if (!drawing) return;
    const t = e.touches[0];
    const p = toCanvasCoords(t.clientX, t.clientY);
    ctx.lineTo(p.x, p.y); ctx.stroke(); points.push({x:p.x, y:p.y});
  }, { passive:false });
  canvas.addEventListener("touchend", () => { drawing = false; });

  // ====== Buttons ======
  document.getElementById("newTaskBtn").addEventListener("click", async ()=>{
    clearCanvas(true);
    try{ await fetchTask(); }catch{}
  });
  document.getElementById("clearBtn").addEventListener("click", () => clearCanvas(true));
  document.getElementById("submitBtn").addEventListener("click", submitDrawing);

  // ====== モーダル（実験方法） ======
  const howtoBtn = document.getElementById("howtoBtn");
  const howtoModal = document.getElementById("howtoModal");
  const howtoClose = document.getElementById("howtoClose");
  const howtoBackdrop = document.getElementById("howtoBackdrop");

  function openHowto(){ howtoModal.setAttribute("aria-hidden", "false"); }
  function closeHowto(){ howtoModal.setAttribute("aria-hidden", "true"); }

  howtoBtn.addEventListener("click", openHowto);
  howtoClose.addEventListener("click", closeHowto);
  howtoBackdrop.addEventListener("click", closeHowto);
  window.addEventListener("keydown", (e)=>{ if(e.key === "Escape") closeHowto(); });

  // ====== Init ======
  (async function init(){
    drawDecor();
    updateProgress();
    try { await fetchTask(); } catch { alert("お題の取得に失敗しました"); }
    window.addEventListener('orientationchange', ()=> drawDecor());
    window.addEventListener('resize', ()=> drawDecor());
  })();
})();
