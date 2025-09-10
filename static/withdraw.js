(() => {
  const wid = document.getElementById("wid");
  const reason = document.getElementById("reason");
  const btn = document.getElementById("withdrawBtn");
  const done = document.getElementById("withdrawDone");
  const errSummary = document.getElementById("withdrawSummary");
  const errWid = document.getElementById("err-wid");

  function setError(inputEl, msgEl, msg){
    if (msg) {
      inputEl.classList.add("is-invalid");
      inputEl.setAttribute("aria-invalid", "true");
      msgEl.textContent = msg;
      msgEl.style.display = "block";
    } else {
      inputEl.classList.remove("is-invalid");
      inputEl.setAttribute("aria-invalid", "false");
      msgEl.textContent = "";
      msgEl.style.display = "none";
    }
  }

  function showSummary(lines){
    if (lines.length === 0) { errSummary.style.display = "none"; errSummary.innerHTML = ""; return; }
    errSummary.innerHTML = `<strong>入力の確認：</strong><ul>${lines.map(l=>`<li>${l}</li>`).join("")}</ul>`;
    errSummary.style.display = "block";
    errSummary.scrollIntoView({behavior:"smooth", block:"center"});
  }

  function validId(v){ return /^[A-Za-z0-9]{6,16}$/.test(v); }

  btn.addEventListener("click", async ()=> {
    const v = (wid.value || "").trim();
    const missing = [];
    if (!v) missing.push("参加者IDを入力してください。");
    else if (!validId(v)) missing.push("参加者IDの形式が正しくありません（英数字6〜16）。");

    setError(wid, errWid, missing.length ? missing[0] : "");
    showSummary(missing);

    if (missing.length) return;

    try {
      const res = await fetch("/withdraw_request", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ user_id: v, reason: (reason.value || "").trim() })
      });
      if (!res.ok) throw new Error("withdraw_request failed");
      const data = await res.json();
      if (data.status !== "success") throw new Error("withdraw_request error");
      done.style.display = "inline-block";
      errSummary.style.display = "none";
      wid.classList.remove("is-invalid");
      reason.value = "";
    } catch {
      showSummary(["送信に失敗しました。通信状況をご確認のうえ、再度お試しください。"]);
    }
  });

  // もし参加者IDがローカルにあれば自動入力
  const pid = localStorage.getItem("participant_id");
  if (pid) { wid.value = pid; }
})();
