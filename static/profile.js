(() => {
  const issuedIdEl     = document.getElementById('issuedId');
  const saveBtn        = document.getElementById('saveProfileBtn');

  const genderEl       = document.getElementById('gender');
  const ageEl          = document.getElementById('age');
  const handedEl       = document.getElementById('handed');
  const deviceTypeEl   = document.getElementById('deviceType');

  const errSummaryEl   = document.getElementById('errorSummary');
  const errGenderEl    = document.getElementById('err-gender');
  const errAgeEl       = document.getElementById('err-age');
  const errHandedEl    = document.getElementById('err-handed');
  const errDeviceEl    = document.getElementById('err-deviceType');

  const CONSENT_VERSION = (window.CONSENT_VERSION || 'v1.0');

  let participantId = localStorage.getItem('participant_id') || '';
  let attempted = false; // ★ クリックするまでエラーを出さない

  // ---- ID発行表示 ----
  async function ensureParticipantId() {
    if (participantId) return;
    try {
      const r = await fetch('/issue_id');
      if (!r.ok) throw new Error('issue id failed');
      const j = await r.json();
      participantId = j.id;
      localStorage.setItem('participant_id', participantId);
    } catch {
      // 発行失敗時はエラーサマリで通知（クリック時に表示）
    }
  }

  function renderIdBadge() {
    if (!issuedIdEl) return;
    if (participantId) {
      issuedIdEl.textContent = participantId;
      issuedIdEl.style.display = '';
    } else {
      issuedIdEl.style.display = 'none';
    }
  }

  // ---- エラーUI ----
  function clearErrors() {
    // サマリ
    errSummaryEl.style.display = 'none';
    errSummaryEl.innerHTML = '';

    // 個別
    [
      [genderEl, errGenderEl],
      [ageEl, errAgeEl],
      [handedEl, errHandedEl],
      [deviceTypeEl, errDeviceEl],
    ].forEach(([field, msg]) => {
      if (field) field.setAttribute('aria-invalid', 'false');
      if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
    });
  }

  function showErrors(map) {
    // サマリ
    const lines = Object.values(map);
    if (lines.length) {
      errSummaryEl.innerHTML = `<strong>入力内容をご確認ください。</strong><ul style="margin:6px 0 0 18px;">${
        lines.map(s => `<li>${s}</li>`).join('')
      }</ul>`;
      errSummaryEl.style.display = '';
      errSummaryEl.focus?.();
      // スクロール上部へ
      setTimeout(() => errSummaryEl.scrollIntoView({behavior:'smooth', block:'start'}), 0);
    }

    // 個別
    if (map.gender)    { genderEl.setAttribute('aria-invalid','true'); errGenderEl.textContent = map.gender; errGenderEl.style.display=''; }
    if (map.age)       { ageEl.setAttribute('aria-invalid','true'); errAgeEl.textContent = map.age; errAgeEl.style.display=''; }
    if (map.handed)    { handedEl.setAttribute('aria-invalid','true'); errHandedEl.textContent = map.handed; errHandedEl.style.display=''; }
    if (map.device)    { deviceTypeEl.setAttribute('aria-invalid','true'); errDeviceEl.textContent = map.device; errDeviceEl.style.display=''; }
  }

  function validate() {
    const errors = {};
    // 必須は空文字のみNG（"noanswer" は選択肢としてOK）
    if (!genderEl.value)     errors.gender = '性別を選択してください。';
    if (!ageEl.value)        errors.age    = '年齢（年代）を選択してください。';
    if (!handedEl.value)     errors.handed = '利き手を選択してください。';
    if (!deviceTypeEl.value) errors.device = 'インターフェースを選択してください。';

    // 同意（必須）は consent ページで取得済みか確認（サーバ側でも検証あり）
    const consentOK = localStorage.getItem('consent_participate') === 'true';
    if (!consentOK) {
      errors.consent = '同意ページで「実験参加への同意」を完了してください。';
    }
    // 参加者ID
    if (!participantId) {
      errors.pid = '参加者IDの発行に失敗しました。ページを更新して再度お試しください。';
    }
    return { ok: Object.keys(errors).length === 0, errors };
  }

  async function submit() {
    attempted = true; // ★ 初めて押した瞬間に「以降はエラー表示を許可」

    clearErrors();
    const { ok, errors } = validate();
    if (!ok) { showErrors(errors); return; }

    const payload = {
      user_id: participantId,
      consent_version: localStorage.getItem('consent_version') || CONSENT_VERSION,
      gender: genderEl.value,
      age_group: ageEl.value,
      handedness: handedEl.value,
      device_type: deviceTypeEl.value,
      consent: localStorage.getItem('consent_participate') === 'true'
    };

    saveBtn.disabled = true;
    try {
      const r = await fetch('/save_profile', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.status !== 'success') {
        throw new Error(j.message || '保存に失敗しました。時間をおいて再度お試しください。');
      }
      // OK → 次のページへ
      localStorage.setItem('consented','true'); // 念のため
      localStorage.setItem('trial_count','0');  // 実験のカウンタ初期化
      location.href = '/draw';
    } catch (e) {
      showErrors({ server: e.message });
    } finally {
      saveBtn.disabled = false;
    }
  }

  // ---- 初期化 ----
  (async function init(){
    // まずID
    await ensureParticipantId();
    renderIdBadge();

    // IDが取れたらボタンを有効化（入力途中のエラーは出さない）
    saveBtn.disabled = !participantId;

    // クリック時のみバリデーション表示
    saveBtn.addEventListener('click', submit);

    // 初回クリック後は、項目変更で再評価（＝ユーザーが直したらエラーが消える）
    [genderEl, ageEl, handedEl, deviceTypeEl].forEach(el => {
      el.addEventListener('change', () => {
        if (!attempted) return; // 押す前は出さない
        clearErrors();
        const { ok, errors } = validate();
        if (!ok) showErrors(errors);
      });
    });
  })();
})();
