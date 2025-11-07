(() => {
  'use strict';

  const issuedIdEl   = document.getElementById('issuedId');
  const saveBtn      = document.getElementById('saveProfileBtn');
  if (!saveBtn) return;

  const genderEl     = document.getElementById('gender');
  const ageEl        = document.getElementById('age');
  const handedEl     = document.getElementById('handed');
  const deviceTypeEl = document.getElementById('deviceType');

  const errSummaryEl = document.getElementById('errorSummary');
  const errGenderEl  = document.getElementById('err-gender');
  const errAgeEl     = document.getElementById('err-age');
  const errHandedEl  = document.getElementById('err-handed');
  const errDeviceEl  = document.getElementById('err-deviceType');

  const CONSENT_VERSION =
    (typeof window.CONSENT_VERSION === 'string' && window.CONSENT_VERSION) ||
    localStorage.getItem('consent_version') ||
    'v1.1';

  let participantId = localStorage.getItem('participant_id') || '';
  let attempted = false;

  // 共通：フィールドの見た目エラー制御
  function setFieldError(fieldEl, msgEl, message) {
    if (!fieldEl || !msgEl) return;
    if (message) {
      fieldEl.classList.add('is-invalid');          // ← 枠を赤に
      fieldEl.setAttribute('aria-invalid', 'true');
      msgEl.textContent = message;
      msgEl.style.display = 'block';
    } else {
      fieldEl.classList.remove('is-invalid');       // ← 枠を元に戻す
      fieldEl.setAttribute('aria-invalid', 'false');
      msgEl.textContent = '';
      msgEl.style.display = 'none';
    }
  }

  // ---- ID発行 ----
  async function ensureParticipantId() {
    if (participantId) return true;
    try {
      const r = await fetch('/issue_id');
      if (!r.ok) throw new Error('issue id failed');
      const j = await r.json();
      if (!j?.id) throw new Error('id missing');
      participantId = String(j.id);
      localStorage.setItem('participant_id', participantId);
      return true;
    } catch {
      return false;
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
    if (errSummaryEl) {
      errSummaryEl.style.display = 'none';
      errSummaryEl.innerHTML = '';
    }
    setFieldError(genderEl,     errGenderEl,  '');
    setFieldError(ageEl,        errAgeEl,     '');
    setFieldError(handedEl,     errHandedEl,  '');
    setFieldError(deviceTypeEl, errDeviceEl,  '');
  }

  function showErrors(map) {
    const lines = Object.values(map);
    if (lines.length && errSummaryEl) {
      errSummaryEl.innerHTML =
        `<strong>入力内容をご確認ください。</strong>` +
        `<ul style="margin:6px 0 0 18px;">${lines.map(s => `<li>${s}</li>`).join('')}</ul>`;
      errSummaryEl.style.display = '';
      errSummaryEl.focus?.();
      setTimeout(() => errSummaryEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    }

    setFieldError(genderEl,     errGenderEl,  map.gender  || '');
    setFieldError(ageEl,        errAgeEl,     map.age     || '');
    setFieldError(handedEl,     errHandedEl,  map.handed  || '');
    setFieldError(deviceTypeEl, errDeviceEl,  map.device  || '');
  }

  function validate() {
    const errors = {};

    if (!genderEl?.value) errors.gender = '性別を選択してください。';

    // 年齢: 18〜120 の整数
    const ageRaw = (ageEl?.value || '').trim();
    if (!ageRaw) {
      errors.age = '年齢を入力してください。';
    } else {
      const ageNum = Number(ageRaw);
      if (!Number.isInteger(ageNum) || ageNum < 18 || ageNum > 120) {
        errors.age = '年齢は18〜120の整数で入力してください。';
      }
    }

    if (!handedEl?.value)     errors.handed = '利き手を選択してください。';
    if (!deviceTypeEl?.value) errors.device = '入力端末を選択してください。';

    const consentOK = localStorage.getItem('consent_participate') === 'true';
    if (!consentOK) {
      errors.consent = '同意ページで「実験参加への同意」を完了してください。';
    }
    if (!participantId) {
      errors.pid = '参加者IDの発行に失敗しました。ページを更新して再度お試しください。';
    }
    return { ok: Object.keys(errors).length === 0, errors };
  }

  async function submit() {
    attempted = true;

    clearErrors();
    const { ok, errors } = validate();
    if (!ok) { showErrors(errors); return; }

    const payload = {
      user_id: participantId,
      consent_version: localStorage.getItem('consent_version') || CONSENT_VERSION,
      gender: genderEl.value,
      age_years: Number(ageEl.value),
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
      localStorage.setItem('consented','true');
      localStorage.setItem('trial_count','0');
      location.href = '/howto';
    } catch (e) {
      showErrors({ server: e.message || 'サーバーエラーが発生しました。' });
    } finally {
      saveBtn.disabled = false;
    }
  }

  // ---- 初期化 ----
  (async function init(){
    const idOk = await ensureParticipantId();
    renderIdBadge();
    saveBtn.disabled = !idOk;

    saveBtn.addEventListener('click', submit);

    const revalidateOnChange = () => {
      if (!attempted) return;
      clearErrors();
      const { ok, errors } = validate();
      if (!ok) showErrors(errors);
    };

    // 入力時に即見た目を正す（枠がおかしく残らない）
    genderEl?.addEventListener('change', () => { setFieldError(genderEl, errGenderEl, ''); revalidateOnChange(); });
    handedEl?.addEventListener('change', () => { setFieldError(handedEl, errHandedEl, ''); revalidateOnChange(); });
    deviceTypeEl?.addEventListener('change', () => { setFieldError(deviceTypeEl, errDeviceEl, ''); revalidateOnChange(); });
    ageEl?.addEventListener('input', () => { setFieldError(ageEl, errAgeEl, ''); revalidateOnChange(); });

    if (!idOk) {
      showErrors({ pid: '参加者IDの発行に失敗しました。ページを更新して再度お試しください。' });
    }
  })();
})();
