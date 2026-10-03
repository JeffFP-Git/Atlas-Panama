// Shared site footer (legal name, address, contact, legal links), included at the
// end of <body> on every public page. Follows the page's ES/EN toggle via the
// same 'atlaspanama_lang' localStorage key; a page can force a language with
// <body data-footer-lang="es|en"> (used by the legal pages, which have no toggle).
(function () {
  const FOOTER_TEXT = {
    es: {
      terms: 'Términos y Condiciones', termsHref: '/terminos',
      privacy: 'Política de Privacidad', privacyHref: '/privacidad',
      contact: 'Contacto',
      country: 'Estados Unidos',
    },
    en: {
      terms: 'Terms of Service', termsHref: '/terms',
      privacy: 'Privacy Policy', privacyHref: '/privacy',
      contact: 'Contact',
      country: 'United States',
    },
  };

  const style = document.createElement('style');
  style.textContent = `
    body { flex-direction: column; }
    .site-footer {
      width: 100%; max-width: 760px; margin: 28px auto 0; padding: 12px 16px;
      text-align: center; font-size: 12px; line-height: 1.7;
      color: rgba(255,255,255,0.92); background: rgba(20,20,40,0.6); border-radius: 10px;
    }
    .site-footer a { color: #fff; text-decoration: underline; }
    .site-footer .footer-links { margin-bottom: 4px; }
    .site-footer .footer-links a { margin: 0 6px; }
  `;
  document.head.appendChild(style);

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  document.body.appendChild(footer);

  function currentLang() {
    const forced = document.body.getAttribute('data-footer-lang');
    if (forced === 'es' || forced === 'en') return forced;
    try {
      const saved = localStorage.getItem('atlaspanama_lang');
      if (saved === 'es' || saved === 'en') return saved;
    } catch (e) { /* storage blocked — fall through to default */ }
    return 'es';
  }

  function render() {
    const f = FOOTER_TEXT[currentLang()];
    footer.innerHTML =
      `<div class="footer-links">` +
        `<a href="${f.termsHref}">${f.terms}</a>·` +
        `<a href="${f.privacyHref}">${f.privacy}</a>·` +
        `<a href="/contact">${f.contact}</a>` +
      `</div>` +
      `<div>© 2026 Atlas Panama LLC · 800 Silks Run #1353, Hallandale Beach, FL 33009, ${f.country}</div>` +
      `<div><a href="mailto:operations@atlaspanama.com">operations@atlaspanama.com</a> · <a href="tel:+17868684257">+1 786 868 4257</a></div>`;
  }

  render();
  // Re-render after the page's own ES/EN toggle handler has updated localStorage.
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.lang-btn')) setTimeout(render, 0);
  });
})();
