// howto.js（開始前のローカル状態クリア + 1秒のディレイ付き遷移）
document.addEventListener('DOMContentLoaded', () => {
  const check = document.getElementById('howtoCheck');
  const btn   = document.getElementById('startBtn');
  if (!check || !btn) return;

  // チェックボックスに応じてボタン活性/非活性
  const syncButton = () => {
    const enabled = check.checked;
    btn.disabled = !enabled;
    if (enabled) btn.removeAttribute('aria-disabled');
    else btn.setAttribute('aria-disabled', 'true');
  };
  syncButton();
  check.addEventListener('change', syncButton);

  btn.addEventListener('click', () => {
    if (btn.disabled) return;

    // howto 通過フラグ
    localStorage.setItem('howto_done', 'true');

    // ★重要：前セッションの残骸をクリア（後方互換キーも含む）
    ['trial_count','submit_count','trap_slot','trap_done'].forEach(k => localStorage.removeItem(k));

    // 参加者IDが既に入っている場合でも、draw.js側で名前空間を使うためここでは触らない

    // UI フィードバック & 1秒待ってから /draw へ遷移
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    const orig = btn.textContent;
    btn.classList.add('is-wait');
    btn.textContent = '準備中…';
    setTimeout(() => {
      btn.textContent = orig;
      location.href = '/draw?from=howto';
    }, 1000);
  });
});
