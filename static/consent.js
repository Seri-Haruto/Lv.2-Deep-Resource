(() => {
  const agreeChk = document.getElementById("agreeChk");
  const toProfileBtn = document.getElementById("toProfileBtn");
  const consentError = document.getElementById("consentError");

  function updateState(){
    const ok = agreeChk.checked;
    toProfileBtn.disabled = !ok;
    consentError.style.display = ok ? "none" : "block";
  }

  agreeChk.addEventListener("change", updateState);

  toProfileBtn.addEventListener("click", () => {
    if (!agreeChk.checked) { updateState(); return; }
    localStorage.setItem("consent_version", "v1.0");
    localStorage.setItem("consented", "true");
    location.href = "/profile";
  });

  // 初期
  updateState();
})();
