
(() => {
  const q = new URLSearchParams(location.search);

  // consent.js の GET 遷移で付くクエリを受け取りローカル保存（JSが遅れても復元）
  if (q.has("agree_participate")) {
    localStorage.setItem("consent_participate", "true");
    localStorage.setItem("consented", "true");         // 互換キー
    if (q.has("agree_reuse")) localStorage.setItem("consent_reuse", "true");
  }
  if (!localStorage.getItem("consent_version")) {
    localStorage.setItem("consent_version", "v1.1");
  }

  // どちらのキーでも OK にする
  const hasConsent =
    localStorage.getItem("consented") === "true" ||
    localStorage.getItem("consent_participate") === "true";

  if (!hasConsent) {
    // 戻す場合は replace で履歴に残さない
    location.replace("/consent");
    return;
  }
})();

(() => {
  const issuedId = document.getElementById("issuedId");
  const saveBtn  = document.getElementById("saveProfileBtn");

  const genderSel = document.getElementById("gender");
  const ageSel    = document.getElementById("age");
  const handSel   = document.getElementById("handed");
  const deviceSel = document.getElementById("deviceType");

  const errSummary = document.getElementById("errorSummary");
  const consented = localStorage.getItem("consented") === "true";
  const consentVersion = localStorage.getItem("consent_version") || "v1.0";

  if (!consented) { location.href = "/consent"; return; }

  let participantId = localStorage.getItem("participant_id") || null;

  async function ensureParticipantId(){
    if (participantId) return;
    try {
      const res = await fetch("/issue_id");
      if (!res.ok) throw new Error("issue_id failed");
      const data = await res.json();
      participantId = data.id;
      localStorage.setItem("participant_id", participantId);
    } catch {
      showSummary(["IDの自動発行に失敗しました。ページを再読み込みしてください。"]);
    }
  }

  function renderId(){
    if (participantId) {
      issuedId.textContent = `ID: ${participantId}`;
      issuedId.style.display = "inline-block";
    }
  }

  function setFieldError(selectEl, msgEl, msg){
    if (msg) {
      selectEl.classList.add("is-invalid");
      selectEl.setAttribute("aria-invalid", "true");
      msgEl.textContent = msg;
      msgEl.style.display = "block";
    } else {
      selectEl.classList.remove("is-invalid");
      selectEl.setAttribute("aria-invalid", "false");
      msgEl.textContent = "";
      msgEl.style.display = "none";
    }
  }

  function showSummary(lines){
    if (lines.length === 0) { errSummary.style.display = "none"; errSummary.innerHTML = ""; return; }
    errSummary.innerHTML = `<strong>未入力があります：</strong><ul>${lines.map(l=>`<li>${l}</li>`).join("")}</ul>`;
    errSummary.style.display = "block";
    errSummary.scrollIntoView({behavior:"smooth", block:"center"});
  }

  function validateForm(showErrors=false){
    const missing = [];
    if (!participantId) missing.push("参加者IDの発行");
    const fields = [
      {el: genderSel, label:"性別", msgEl: document.getElementById("err-gender")},
      {el: ageSel,    label:"年齢（年代）", msgEl: document.getElementById("err-age")},
      {el: handSel,   label:"利き手", msgEl: document.getElementById("err-handed")},
      {el: deviceSel, label:"インターフェース", msgEl: document.getElementById("err-deviceType")}
    ];

    fields.forEach(f => {
      const ok = !!f.el.value;
      if (showErrors) setFieldError(f.el, f.msgEl, ok ? "" : `${f.label}を選択してください。`);
      if (!ok) missing.push(f.label);
    });

    saveBtn.disabled = missing.length > 0;
    if (showErrors) showSummary(missing);
    return missing.length === 0;
  }

  [genderSel, ageSel, handSel, deviceSel].forEach(el => {
    el.addEventListener("change", ()=> validateForm(true));
  });

  saveBtn.addEventListener("click", async () => {
    if (!validateForm(true)) return;
    const payload = {
      user_id: participantId,
      consent_version: consentVersion,
      gender: genderSel.value,
      age_group: ageSel.value,
      handedness: handSel.value,
      device_type: deviceSel.value,
      consent: true
    };
    try {
      const res = await fetch("/save_profile", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("save_profile failed");
      const data = await res.json();
      if (data.status !== "success") throw new Error("save_profile error");
      localStorage.setItem("trial_count", "0");
      location.href = "/draw";
    } catch {
      showSummary(["保存に失敗しました。通信状況を確認のうえ、再度お試しください。"]);
    }
  });

  (async function init(){
    await ensureParticipantId();
    renderId();
    validateForm(false);
  })();
})();
