(() => {
  const form = document.getElementById("consentForm");
  const must = document.getElementById("agreeParticipate");
  const opt  = document.getElementById("agreeReuse");
  const btn  = document.getElementById("toProfileBtn");
  const err  = document.getElementById("consentError");

  function update() {
    const ok = must && must.checked;
    if (btn) btn.disabled = !ok;
    if (err) err.style.display = ok ? "none" : "block";
  }

  if (must) must.addEventListener("change", update);
  if (opt)  opt.addEventListener("change", () => { /* 任意なので何もしない */ });

  if (form) {
    form.addEventListener("submit", (e) => {
      // 必須が未チェックなら送信させない（ブラウザrequiredでも止まるが二重で保険）
      if (!(must && must.checked)) {
        e.preventDefault();
        update();
        return;
      }
      // 同意状態を記録（任意は未チェックなら false）
      try {
        localStorage.setItem("consent_participate", "true");
        localStorage.setItem("consent_reuse", opt && opt.checked ? "true" : "false");
        localStorage.setItem("consent_version", "v1.1");
        localStorage.setItem("consented", "true"); // 互換キー：profile.js が参照している想定
      } catch (_) {}
      // 送信はそのまま → /profile へ遷移
    });
  }

  // 初期状態を反映
  update();
})();
