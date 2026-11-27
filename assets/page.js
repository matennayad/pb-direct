/* Shared by the plain pages (accessibility statement, privacy policy, 404): fills business details from config.js. */
(() => {
  'use strict';
  const S = window.SITE || {};
  const wa = text => `https://wa.me/${S.whatsapp}?text=${encodeURIComponent(text || S.whatsappGeneral || '')}`;
  document.querySelectorAll('[data-cfg]').forEach(el => {
    const v = S[el.dataset.cfg];
    if (v) el.textContent = v;
    else if (el.closest('[data-cfg-row]')) el.closest('[data-cfg-row]').hidden = true;
  });
  document.querySelectorAll('[data-cfg-tel]').forEach(a => { const v = S[a.dataset.cfgTel]; if (v) { a.href = `tel:${v.replace(/[^\d+]/g, '')}`; a.textContent = v; } });
  document.querySelectorAll('[data-cfg-mail]').forEach(a => { const v = S[a.dataset.cfgMail]; if (v) { a.href = `mailto:${v}`; a.textContent = v; } });
  document.querySelectorAll('[data-wa-general]').forEach(a => { a.href = wa(); });
  const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
})();
