(() => {
  const form = document.getElementById("consentForm");
  if (!form) return;

  const must = document.getElementById("agreeParticipate"); // 必須
  const opt  = document.getElementById("agreeReuse");        // 任意
  const btn  = document.getElementById("toProfileBtn");      // 次へ
  const err  = document.getElementById("consentError");      // エラーメッセージ

  // 初期は必ず非表示
  if (err) err.style.display = "none";

  // 「送信を試みたか」のフラグ
  let tried = false;

  // ボタンの有効化（エラーは tried 後のみ制御）
  function update() {
    const ok = !!must?.checked;
    if (btn) btn.disabled = !ok;
    if (tried && err) err.style.display = ok ? "none" : "block";
  }

  // チェックが変わったら見た目更新（初期はエラーを出さない）
  must?.addEventListener("change", update);
  opt?.addEventListener("change", () => { /* 任意なので何もしない */ });

  // 送信時のみエラー表示を評価
  form.addEventListener("submit", (e) => {
    const ok = !!must?.checked;
    if (!ok) {
      e.preventDefault();
      tried = true;     // ここからエラー表示を許可
      update();         // エラーを表示
      return;
    }

    // 同意状態を保存
    try {
      localStorage.setItem("consent_participate", "true");
      localStorage.setItem("consent_reuse", opt?.checked ? "true" : "false");
      localStorage.setItem("consent_version", "v1.1");
      localStorage.setItem("consented", "true");
    } catch (_) {}
    // そのまま /profile へ
  });

  // ボタン活性だけ反映（エラーは出さない）
  update();
})();
