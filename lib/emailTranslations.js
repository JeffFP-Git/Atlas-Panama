/**
 * Backend email copy, in English and Spanish, keyed the same way as the frontend's
 * TRANSLATIONS dict in subscribe.html/verify.html/payment.html — so the whole
 * subscriber journey (forms, pages, AND emails) respects the language they picked
 * at signup (`request.language`, 'es' or 'en'), not just the pages they click through.
 */
const EMAIL_TRANSLATIONS = {
  en: {
    'noMatch.subject': "We couldn't find a match for {searchLabel}",
    'noMatch.text': 'Hello,\n\nWe searched the Registro Público for "{searchLabel}" but couldn\'t find a match.\n\nPlease reply to this email with corrected details and we\'ll try again, or visit the website to submit a new search.',
    'noMatch.html': '<p>Hello,</p><p>We searched the Registro Público for "<strong>{searchLabel}</strong>" but couldn\'t find a match.</p><p>Please reply to this email with corrected details and we\'ll try again, or visit the website to submit a new search.</p>',

    'refine.subject': 'Too many matches for {searchLabel} — please refine your search',
    'refine.text': 'Hello,\n\nYour search for "{searchLabel}" returned too many results to show individually.\n\nPlease reply to this email with {refineHint}, and we\'ll try again.',
    'refine.html': '<p>Hello,</p><p>Your search for "<strong>{searchLabel}</strong>" returned too many results to show individually.</p><p>Please reply to this email with {refineHint}, and we\'ll try again.</p>',
    'refine.hintInmueble': "the property's Código de Ubicación, or the owner's name",
    'refine.hintEntity': "the entity's RUC number, or a more specific name",

    'disambig.subject': 'We found {count} matches for {searchLabel} — please pick yours',
    'disambig.text': 'Hello,\n\nWe found {count} matches for "{searchLabel}":\n\n{list}\n\nPlease visit the website and select the correct one, or reply to this email.',
    'disambig.html': '<p>Hello,</p><p>We found {count} matches for "<strong>{searchLabel}</strong>":</p><ul>{list}</ul><p>Click the correct one above to continue.</p>',
    'disambig.pickThisOne': 'This is the one',

    'verify.subjectInmueble': 'Verify Your Property Subscription: {label}',
    'verify.subjectEntity': 'Verify Your Business Subscription: {label}',
    'verify.introInmueble': 'Please review the following property information for {label}:',
    'verify.introEntity': 'Please review the following business information for {label}:',
    'verify.dataFallback': 'Data extracted successfully',
    'verify.buttonLabel': 'Confirm Email & Choose My Plan',
    'verify.buttonSub': 'Clicking confirms your email works and takes you straight to secure checkout ({monthly} or {annual}). Trouble with the button? Copy this link into your browser:',
    'verify.linkTextPrefix': 'Confirm Email & Choose My Plan ({monthly} or {annual}):',

    'monitor.errorSubject': '⚠️ Atlas Panama: Could Not Check {displayName} Today',
    'monitor.errorText': 'We were unable to check the Registro Público for {displayName} today.\n\nError: {error}\n\nWe will try again on the next scheduled check. If this keeps happening, please contact us.\n',
    'monitor.errorHtml': '<h2>Could Not Check {displayName} Today</h2><p>We were unable to check the Registro Público for <strong>{displayName}</strong> today.</p><p><strong>Error:</strong> {error}</p><p>We will try again on the next scheduled check. If this keeps happening, please contact us.</p>',
    'monitor.noChangesSubject': '✅ Atlas Panama: No Changes — {displayName}',
    'monitor.changeSubject': '🔔 Atlas Panama: Change Detected — {displayName}',
    'monitor.firstRunSubject': '✅ Atlas Panama: Monitoring Started — {displayName}',
    'monitor.firstRunText': 'This is your first daily check for {displayName}. We\'ve saved today\'s record as the baseline — from now on, we\'ll email you whenever something changes.\n\nThe attached PDF shows the current record.\n\n{disclaimer}\n',
    'monitor.firstRunHtml': '<h2>Baseline Saved — {displayName}</h2><p>This is your first daily check for <strong>{displayName}</strong>. We\'ve saved today\'s record as the baseline — from now on, we\'ll email you whenever something changes.</p><p>The attached PDF shows the current record.</p>{disclaimerHtml}',
    'monitor.changesText': 'We found a change today for {displayName}:\n\n{bullets}\n\nThe attached PDF shows the full current record, with the changed entries highlighted.\n\n{disclaimer}\n',
    'monitor.changesHtml': '<h2>Change Detected — {displayName}</h2><p>We found the following change(s) today:</p><ul>{bulletsHtml}</ul><p>The attached PDF shows the full current record, with the changed entries highlighted.</p>{disclaimerHtml}',
    'monitor.noChangesText': 'No changes today for {displayName}. We checked the Registro Público and everything looks the same as our last check.\n\nThe attached PDF shows the current record for your files.\n',
    'monitor.noChangesHtml': '<h2>No Changes — {displayName}</h2><p>We checked the Registro Público for <strong>{displayName}</strong> today and everything looks the same as our last check.</p><p>The attached PDF shows the current record for your files.</p>',
    'monitor.disclaimerText': 'IMPORTANT: If you did not authorize or do not recognize a change described above, please contact your attorney or accountant promptly — it may affect your ownership rights.',
    'monitor.disclaimerHtml': '<div style="margin-top:20px;padding:12px;border:2px solid #e74c3c;background:#fdecea;font-size:12px;color:#922;"><strong>Important:</strong> If you did not authorize or do not recognize a change described above, please contact your attorney or accountant promptly — it may affect your ownership rights.</div>',

    'pdf.defaultTitle': 'Atlas Panama Record Report',
    'pdf.generatedLabel': 'Generated',
    'pdf.noEntries': 'No entries found.',
    'pdf.whatChanged': 'What changed:',
    'pdf.disclaimerImportant': 'Important:',
    'pdf.disclaimerBody': 'If you did not authorize or do not recognize a change reflected in this record, please contact your attorney or accountant promptly — it may affect your ownership rights.'
  },
  es: {
    'noMatch.subject': 'No encontramos ninguna coincidencia para {searchLabel}',
    'noMatch.text': 'Hola,\n\nBuscamos en el Registro Público "{searchLabel}" pero no encontramos ninguna coincidencia.\n\nPor favor responda a este correo con los datos corregidos y lo intentaremos de nuevo, o visite el sitio web para enviar una nueva búsqueda.',
    'noMatch.html': '<p>Hola,</p><p>Buscamos en el Registro Público "<strong>{searchLabel}</strong>" pero no encontramos ninguna coincidencia.</p><p>Por favor responda a este correo con los datos corregidos y lo intentaremos de nuevo, o visite el sitio web para enviar una nueva búsqueda.</p>',

    'refine.subject': 'Demasiadas coincidencias para {searchLabel} — por favor refine su búsqueda',
    'refine.text': 'Hola,\n\nSu búsqueda de "{searchLabel}" arrojó demasiados resultados para mostrarlos individualmente.\n\nPor favor responda a este correo con {refineHint}, y lo intentaremos de nuevo.',
    'refine.html': '<p>Hola,</p><p>Su búsqueda de "<strong>{searchLabel}</strong>" arrojó demasiados resultados para mostrarlos individualmente.</p><p>Por favor responda a este correo con {refineHint}, y lo intentaremos de nuevo.</p>',
    'refine.hintInmueble': 'el Código de Ubicación de la propiedad, o el nombre del propietario',
    'refine.hintEntity': 'el número de RUC de la entidad, o un nombre más específico',

    'disambig.subject': 'Encontramos {count} coincidencias para {searchLabel} — por favor elija la suya',
    'disambig.text': 'Hola,\n\nEncontramos {count} coincidencias para "{searchLabel}":\n\n{list}\n\nPor favor visite el sitio web y seleccione la correcta, o responda a este correo.',
    'disambig.html': '<p>Hola,</p><p>Encontramos {count} coincidencias para "<strong>{searchLabel}</strong>":</p><ul>{list}</ul><p>Haga clic en la correcta arriba para continuar.</p>',
    'disambig.pickThisOne': 'Esta es la mía',

    'verify.subjectInmueble': 'Verifique su suscripción de propiedad: {label}',
    'verify.subjectEntity': 'Verifique su suscripción empresarial: {label}',
    'verify.introInmueble': 'Por favor revise la siguiente información de la propiedad para {label}:',
    'verify.introEntity': 'Por favor revise la siguiente información comercial para {label}:',
    'verify.dataFallback': 'Datos extraídos correctamente',
    'verify.buttonLabel': 'Confirmar correo y elegir mi plan',
    'verify.buttonSub': 'Al hacer clic confirmamos que su correo funciona y le llevamos directo a un pago seguro ({monthly} o {annual}). ¿Problemas con el botón? Copie este enlace en su navegador:',
    'verify.linkTextPrefix': 'Confirmar correo y elegir mi plan ({monthly} o {annual}):',

    'monitor.errorSubject': '⚠️ Atlas Panama: No pudimos revisar {displayName} hoy',
    'monitor.errorText': 'No pudimos revisar el Registro Público para {displayName} hoy.\n\nError: {error}\n\nLo intentaremos de nuevo en la próxima revisión programada. Si esto sigue ocurriendo, por favor contáctenos.\n',
    'monitor.errorHtml': '<h2>No pudimos revisar {displayName} hoy</h2><p>No pudimos revisar el Registro Público para <strong>{displayName}</strong> hoy.</p><p><strong>Error:</strong> {error}</p><p>Lo intentaremos de nuevo en la próxima revisión programada. Si esto sigue ocurriendo, por favor contáctenos.</p>',
    'monitor.noChangesSubject': '✅ Atlas Panama: Sin cambios — {displayName}',
    'monitor.changeSubject': '🔔 Atlas Panama: Cambio detectado — {displayName}',
    'monitor.firstRunSubject': '✅ Atlas Panama: Monitoreo iniciado — {displayName}',
    'monitor.firstRunText': 'Esta es su primera revisión diaria para {displayName}. Guardamos el registro de hoy como referencia — de ahora en adelante, le enviaremos un correo cada vez que algo cambie.\n\nEl PDF adjunto muestra el registro actual.\n\n{disclaimer}\n',
    'monitor.firstRunHtml': '<h2>Registro base guardado — {displayName}</h2><p>Esta es su primera revisión diaria para <strong>{displayName}</strong>. Guardamos el registro de hoy como referencia — de ahora en adelante, le enviaremos un correo cada vez que algo cambie.</p><p>El PDF adjunto muestra el registro actual.</p>{disclaimerHtml}',
    'monitor.changesText': 'Encontramos un cambio hoy para {displayName}:\n\n{bullets}\n\nEl PDF adjunto muestra el registro completo actual, con las entradas modificadas resaltadas.\n\n{disclaimer}\n',
    'monitor.changesHtml': '<h2>Cambio detectado — {displayName}</h2><p>Encontramos el (los) siguiente(s) cambio(s) hoy:</p><ul>{bulletsHtml}</ul><p>El PDF adjunto muestra el registro completo actual, con las entradas modificadas resaltadas.</p>{disclaimerHtml}',
    'monitor.noChangesText': 'Sin cambios hoy para {displayName}. Revisamos el Registro Público y todo se ve igual que en nuestra última revisión.\n\nEl PDF adjunto muestra el registro actual para su archivo.\n',
    'monitor.noChangesHtml': '<h2>Sin cambios — {displayName}</h2><p>Revisamos el Registro Público para <strong>{displayName}</strong> hoy y todo se ve igual que en nuestra última revisión.</p><p>El PDF adjunto muestra el registro actual para su archivo.</p>',
    'monitor.disclaimerText': 'IMPORTANTE: Si usted no autorizó o no reconoce un cambio descrito arriba, por favor contacte a su abogado o contador de inmediato — podría afectar sus derechos de propiedad.',
    'monitor.disclaimerHtml': '<div style="margin-top:20px;padding:12px;border:2px solid #e74c3c;background:#fdecea;font-size:12px;color:#922;"><strong>Importante:</strong> Si usted no autorizó o no reconoce un cambio descrito arriba, por favor contacte a su abogado o contador de inmediato — podría afectar sus derechos de propiedad.</div>',

    'pdf.defaultTitle': 'Informe de Registro de Atlas Panama',
    'pdf.generatedLabel': 'Generado',
    'pdf.noEntries': 'No se encontraron entradas.',
    'pdf.whatChanged': 'Qué cambió:',
    'pdf.disclaimerImportant': 'Importante:',
    'pdf.disclaimerBody': 'Si usted no autorizó o no reconoce un cambio reflejado en este registro, por favor contacte a su abogado o contador de inmediato — podría afectar sus derechos de propiedad.'
  }
};

/**
 * @param {'es'|'en'} lang
 * @param {string} key
 * @param {object} [vars]
 */
export function t(lang, key, vars) {
  const safeLang = lang === 'en' ? 'en' : 'es';
  const dict = EMAIL_TRANSLATIONS[safeLang] || EMAIL_TRANSLATIONS.es;
  let str = dict[key] ?? EMAIL_TRANSLATIONS.es[key] ?? key;
  if (vars) Object.keys(vars).forEach(k => { str = str.split('{' + k + '}').join(vars[k]); });
  return str;
}

export default { t };
