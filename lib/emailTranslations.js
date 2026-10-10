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

    // Shown instead of noMatch.* once this subscriber has had 2+ no-match searches —
    // matches the promise made on the Q&A page ("after two tries, email us and we'll
    // help you find it, free") rather than just asking them to keep guessing.
    'noMatchRepeat.subject': "We still couldn't find a match for {searchLabel} — let us help",
    'noMatchRepeat.text': 'Hello,\n\nWe searched again for "{searchLabel}" but still couldn\'t find a match.\n\nPlease reply to this email, or write to operations@atlaspanama.com, with whatever information you have about the property or entity (full legal name, RUC, Folio number, owner\'s name — anything that might help). We\'ll help you find it, free of charge.',
    'noMatchRepeat.html': '<p>Hello,</p><p>We searched again for "<strong>{searchLabel}</strong>" but still couldn\'t find a match.</p><p>Please reply to this email, or write to <a href="mailto:operations@atlaspanama.com">operations@atlaspanama.com</a>, with whatever information you have about the property or entity (full legal name, RUC, Folio number, owner\'s name — anything that might help). We\'ll help you find it, free of charge.</p>',

    'refine.subject': 'Too many matches for {searchLabel} — please refine your search',
    'refine.text': 'Hello,\n\nYour search for "{searchLabel}" returned too many results to show individually.\n\nPlease reply to this email with {refineHint}, and we\'ll try again.',
    'refine.html': '<p>Hello,</p><p>Your search for "<strong>{searchLabel}</strong>" returned too many results to show individually.</p><p>Please reply to this email with {refineHint}, and we\'ll try again.</p>',
    'refine.textInmueble': 'Hello,\n\nYour search for "{searchLabel}" returned too many properties to show individually.\n\nPlease search again using at least 2 of these 3 details:\n- Folio\n- Location Code\n- Owner Name\n\nSearch again here: {url}\n\nIf you still can\'t find it, write to operations@atlaspanama.com with whatever you know about the property and we\'ll help you.\n\n— Atlas Panama',
    'refine.htmlInmueble': '<p>Hello,</p><p>Your search for "<strong>{searchLabel}</strong>" returned too many properties to show individually.</p><p>Please search again using <strong>at least 2 of these 3 details</strong>:</p><ul><li>Folio</li><li>Location Code</li><li>Owner Name</li></ul><p><a href="{url}" style="display:inline-block;padding:12px 22px;background:#667eea;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Search again</a></p><p style="color:#777;font-size:13px;">If you still can\'t find it, write to operations@atlaspanama.com with whatever you know about the property and we\'ll help you.</p><p>— Atlas Panama</p>',
    'refine.textEntity': 'Hello,\n\nYour search for "{searchLabel}" returned too many companies or foundations to show individually.\n\nPlease search again with the full name exactly as registered (for example "My Company, S.A."), or with the full RUC.\n\nSearch again here: {url}\n\nIf you still can\'t find it, write to operations@atlaspanama.com and we\'ll help you.\n\n— Atlas Panama',
    'refine.htmlEntity': '<p>Hello,</p><p>Your search for "<strong>{searchLabel}</strong>" returned too many companies or foundations to show individually.</p><p>Please search again with the <strong>full name exactly as registered</strong> (for example "My Company, S.A."), or with the <strong>full RUC</strong>.</p><p><a href="{url}" style="display:inline-block;padding:12px 22px;background:#667eea;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Search again</a></p><p style="color:#777;font-size:13px;">If you still can\'t find it, write to operations@atlaspanama.com and we\'ll help you.</p><p>— Atlas Panama</p>',
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
    'verify.buttonLabelTrial': 'Confirm Email & Start My 30 Free Days',
    'verify.buttonSubTrial': 'No credit card needed. Clicking confirms your email works; one more click starts daily monitoring. Trouble with the button? Copy this link into your browser:',
    'verify.linkTextPrefixTrial': 'Confirm Email & Start My 30 Free Days (no credit card):',

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
    'monitor.noChangesText': 'No changes today for {displayName}. We checked the Registro Público and everything looks the same as our last check, on {previousDate}.\n\nThe attached PDF shows the current record for your files.\n',
    'monitor.noChangesHtml': '<h2>No Changes — {displayName}</h2><p>We checked the Registro Público for <strong>{displayName}</strong> today and everything looks the same as our last check, on {previousDate}.</p><p>The attached PDF shows the current record for your files.</p>',
    'monitor.disclaimerText': 'IMPORTANT: If you did not authorize or do not recognize a change described above, please contact your attorney or accountant promptly — it may affect your ownership rights.',
    'monitor.disclaimerHtml': '<div style="margin-top:20px;padding:12px;border:2px solid #e74c3c;background:#fdecea;font-size:12px;color:#922;"><strong>Important:</strong> If you did not authorize or do not recognize a change described above, please contact your attorney or accountant promptly — it may affect your ownership rights.</div>',

    'monitor.referralText': 'If you find this service valuable, we\'d appreciate you recommending us to a friend or colleague — they can sign up here: {subscribeUrl}\n',
    'monitor.referralHtml': '<p style="margin-top:16px;color:#555;">If you find this service valuable, we\'d appreciate you recommending us to a friend or colleague — they can sign up here: <a href="{subscribeUrl}">{subscribeUrl}</a></p>',

    'digest.subjectAllClear': '✅ Atlas Panama: Update — {count} properties/entities, no changes',
    'digest.subjectOneChange': '⚠️ CHANGE DETECTED: {displayName} — Atlas Panama',
    'digest.subjectSomeChanges': '⚠️ CHANGES DETECTED in {changedCount} of your {count} properties/entities — Atlas Panama',
    'digest.subjectAllClearOne': '✅ Atlas Panama: Update — {displayName}, no changes',
    'digest.introAllClearOne': 'Here\'s your update on {displayName}. Nothing has changed since our last check.',
    'digest.introWithNewOne': 'Here\'s your first update on {displayName}. Today\'s check is the starting point we\'ll compare future checks against.',
    'digest.introOneChangeOne': 'We detected a change in {displayName}. See the details below; the full record is attached as a PDF.',
    'digest.introAllClear': 'Here\'s your update on all {count} properties/entities we monitor for you. Nothing has changed since our last check of each.',
    'digest.introWithNew': 'Here\'s your update on all {count} properties/entities we monitor for you. No changes found. Anything marked 🆕 was checked for the first time today; that check is the starting point we\'ll compare future checks against.',
    'digest.introSomeChanges': 'Here\'s your update on all {count} properties/entities we monitor for you. {changedCount} of them changed — see below, with the full PDF attached for each.',
    'digest.itemNoChange': '✅ {displayName} — no changes since {previousDate}.',
    'digest.itemFirstRun': '🆕 {displayName} — monitoring started today; this is the baseline we\'ll compare future checks against.',
    'digest.itemChangeHeader': '⚠️ CHANGE DETECTED — {displayName}:',
    'digest.cadenceNote': 'We check the Registro Público every day for all your properties and entities. Routine updates like this one are sent on a {frequency} basis — but if anything actually changes, we email you right away, regardless of schedule.',
    'digest.frequencyWeekly': 'weekly',
    'digest.noAttachmentNote': ' We have not attached the unchanged property or entity PDF records here — we only attach PDFs when there are changes.',

    'welcome.subject': 'Welcome to Atlas Panama — {displayName} is now being monitored',
    'welcome.text': 'Welcome to Atlas Panama!\n\nYour subscription for {displayName} is now active. We check Panama\'s Registro Público every single day — but to keep your inbox light, we only send a routine update weekly. If anything actually changes, though, we email you right away, regardless of that schedule.\n{paymentDetails}\nBy subscribing, you agreed to our Terms of Service: {tosUrl} (in Spanish, the official language for legal purposes in Panama). We recommend keeping this email for your records.\n\nWe hope you find this valuable. If you do, we\'d really appreciate you recommending us to a friend or colleague — they can sign up here: {subscribeUrl}\n\nThank you for being one of our first subscribers!\n— Atlas Panama',
    'welcome.html': '<h2>Welcome to Atlas Panama!</h2><p>Your subscription for <strong>{displayName}</strong> is now active. We check Panama\'s Registro Público every single day — but to keep your inbox light, we only send a routine update weekly. If anything actually changes, though, we email you right away, regardless of that schedule.</p>{paymentDetailsHtml}<p style="color:#666;font-size:13px;">By subscribing, you agreed to our <a href="{tosUrl}">Terms of Service</a> (in Spanish, the official language for legal purposes in Panama). We recommend keeping this email for your records.</p><p>We hope you find this valuable. If you do, we\'d really appreciate you recommending us to a friend or colleague — they can sign up here: <a href="{subscribeUrl}">{subscribeUrl}</a></p><p>Thank you for being one of our first subscribers!<br>— Atlas Panama</p>',
    'welcome.paymentDetailsText': 'Plan: {planLabel}. Next renewal: {renewalDate}.\n',
    'welcome.trialNoCardDetailsText': 'Free trial: 30 days, no card needed, until {trialEnd}. We\'ll email you 5 days and 1 day before it ends so you can choose a plan ($1/month or $10/year) if you want to continue.\n',
    'welcome.trialNoCardDetailsHtml': '<p>🎁 <strong>Free trial: 30 days, no card needed</strong>, until <strong>{trialEnd}</strong>. We\'ll email you 5 days and 1 day before it ends so you can choose a plan ($1/month or $10/year) if you want to continue.</p>',
    'noCardTrial.ending5Subject': 'Your free trial for {displayName} ends in 5 days',
    'noCardTrial.ending5Text': 'Hello,\n\nYour 30-day free trial for {displayName} ends on {trialEnd}. To keep receiving daily Registro Público monitoring and alerts, choose a plan below. If you choose now, you won\'t be charged until your free trial ends.',
    'noCardTrial.ending5Html': '<p>Hello,</p><p>Your 30-day free trial for <strong>{displayName}</strong> ends on <strong>{trialEnd}</strong>. To keep receiving daily Registro Público monitoring and alerts, choose a plan below. If you choose now, you won\'t be charged until your free trial ends.</p>',
    'noCardTrial.ending1Subject': 'Last day: your free trial for {displayName} ends tomorrow',
    'noCardTrial.ending1Text': 'Hello,\n\nYour free trial for {displayName} ends on {trialEnd}. Choose a plan to keep your property or company monitored every day. If you don\'t, monitoring will stop when the trial ends.',
    'noCardTrial.ending1Html': '<p>Hello,</p><p>Your free trial for <strong>{displayName}</strong> ends on <strong>{trialEnd}</strong>. Choose a plan to keep your property or company monitored every day. If you don\'t, monitoring will stop when the trial ends.</p>',
    'noCardTrial.expiredSubject': 'Monitoring paused for {displayName}: your free trial has ended',
    'noCardTrial.expiredText': 'Hello,\n\nYour free trial for {displayName} ended on {trialEnd}, so we have stopped checking the Registro Público for it. You can turn monitoring back on at any time by choosing a plan below.',
    'noCardTrial.expiredHtml': '<p>Hello,</p><p>Your free trial for <strong>{displayName}</strong> ended on <strong>{trialEnd}</strong>, so we have stopped checking the Registro Público for it. You can turn monitoring back on at any time by choosing a plan below.</p>',
    'noCardTrial.buttonsText': 'Monthly, $1/month: {monthlyUrl}\nAnnual, $10/year: {annualUrl}',
    'noCardTrial.buttonsHtml': '<p><a href="{monthlyUrl}" style="display:inline-block;margin:6px 8px 6px 0;padding:12px 20px;background:#667eea;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">$1 / month</a><a href="{annualUrl}" style="display:inline-block;margin:6px 8px 6px 0;padding:12px 20px;background:#667eea;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">$10 / year</a></p>',
    'noCardTrial.trustText': 'Payment is processed securely by Stripe, which handles payments for more than 5 million businesses worldwide. Atlas Panama never sees or stores your card details.',
    'trialConverted.subject': 'All set: {displayName} stays monitored',
    'trialConverted.text': 'Thank you! Your {planLabel} plan for {displayName} is active. Your first charge will be on {firstCharge}. Manage your subscription anytime: {manageUrl}\n\n— Atlas Panama',
    'trialConverted.html': '<p>Thank you!</p><p>Your <strong>{planLabel}</strong> plan for <strong>{displayName}</strong> is active. Your first charge will be on <strong>{firstCharge}</strong>.</p><p><a href="{manageUrl}">Manage my subscription</a></p><p>— Atlas Panama</p>',
    'lead.subject': 'Your link to finish signing up for Atlas Panama',
    'lead.text': 'Hello,\n\nHere is the link to finish your Atlas Panama signup whenever you have your property or company details handy (the Folio or owner name for a property; the name or RUC for a company or foundation):\n\n{url}\n\nThe first 30 days are free.\n\n— Atlas Panama',
    'lead.html': '<p>Hello,</p><p>Here is the link to finish your Atlas Panama signup whenever you have your property or company details handy (the Folio or owner name for a property; the name or RUC for a company or foundation).</p><p><a href="{url}" style="display:inline-block;padding:12px 22px;background:#667eea;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Finish my signup</a></p><p>The first 30 days are free.</p><p>— Atlas Panama</p>',
    'lead.reminderSubject': 'Reminder: protect your property in Panama, first 30 days free',
    'lead.reminderText': 'Hello,\n\nYesterday you asked us for the link to sign up for Atlas Panama. When you have a minute (and the Folio, owner name, or company name), you can finish here:\n\n{url}\n\nWe check the Registro Público every day and email you as soon as something changes. The first 30 days are free.\n\nThis is the only reminder we will send.\n\n— Atlas Panama',
    'lead.reminderHtml': '<p>Hello,</p><p>Yesterday you asked us for the link to sign up for Atlas Panama. When you have a minute (and the Folio, owner name, or company name), you can finish here:</p><p><a href="{url}" style="display:inline-block;padding:12px 22px;background:#667eea;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Finish my signup</a></p><p>We check the Registro Público every day and email you as soon as something changes. <strong>The first 30 days are free.</strong></p><p style="color:#777;font-size:12px;">This is the only reminder we will send.</p><p>— Atlas Panama</p>',
    'welcome.trialDetailsText': 'Free trial: no charge until {trialEnd}. After that, {planLabel}, renewing automatically (cancel anytime before then at no cost).\n',
    'welcome.trialDetailsHtml': '<p>🎁 <strong>Free trial:</strong> no charge until <strong>{trialEnd}</strong>. After that, {planLabel}, renewing automatically. Cancel anytime before then at no cost.</p>',
    'welcome.trialCardReusedText': 'This card was already used for a free trial, so billing started today. Plan: {planLabel}. Next renewal: {renewalDate}.\n',
    'welcome.trialCardReusedHtml': '<p>This card was already used for a free trial, so billing started today.<br><strong>Plan:</strong> {planLabel} &nbsp;|&nbsp; <strong>Next renewal:</strong> {renewalDate}</p>',
    'trialEnding.subject': 'Your Atlas Panama free trial ends on {trialEnd}: {displayName}',
    'trialEnding.text': 'Hello,\n\nYour free trial for {displayName} ends on {trialEnd}. On that day your subscription continues automatically at {planLabel}, charged to the card you provided.\n\nNothing to do if you want to keep monitoring. To cancel before then at no cost, use this link: {manageUrl}\n\n— Atlas Panama',
    'trialEnding.html': '<p>Hello,</p><p>Your free trial for <strong>{displayName}</strong> ends on <strong>{trialEnd}</strong>. On that day your subscription continues automatically at <strong>{planLabel}</strong>, charged to the card you provided.</p><p>Nothing to do if you want to keep monitoring. To cancel before then at no cost: <a href="{manageUrl}">Manage my subscription</a></p><p>— Atlas Panama</p>',
    'manage.linkLabel': 'Manage subscription (update card, invoices, cancel)',
    'manage.welcomeText': 'To update your card, see invoices, or cancel at any time: {manageUrl}\n',
    'manage.welcomeHtml': '<p>To update your card, see invoices, or cancel at any time: <a href="{manageUrl}">Manage my subscription</a></p>',
    'welcome.paymentDetailsHtml': '<p><strong>Plan:</strong> {planLabel} &nbsp;|&nbsp; <strong>Next renewal:</strong> {renewalDate}</p>',

    'pdf.defaultTitle': 'Atlas Panama Record Report',
    'pdf.removedEntries': 'Entries no longer shown (removed since the last check):',
    'pdf.reviewLabel': 'Registro Público review date',
    'pdf.generatedLabel': 'Generated',
    'pdf.noEntries': 'No entries found.',
    'pdf.whatChanged': 'What changed:',
    'pdf.noChangesSince': 'No changes since our last check, on {previousDate}.',
    'pdf.firstCheck': 'This is the first check for this record — saved as the baseline for future comparisons.',
    'pdf.disclaimerImportant': 'Important:',
    'pdf.disclaimerBody': 'If you did not authorize or do not recognize a change reflected in this record, please contact your attorney or accountant promptly — it may affect your ownership rights.',

    'date.months': 'January,February,March,April,May,June,July,August,September,October,November,December',
    'date.format': '{month} {day}, {year}'
  },
  es: {
    'noMatch.subject': 'No encontramos ninguna coincidencia para {searchLabel}',
    'noMatch.text': 'Hola,\n\nBuscamos en el Registro Público "{searchLabel}" pero no encontramos ninguna coincidencia.\n\nPor favor responda a este correo con los datos corregidos y lo intentaremos de nuevo, o visite el sitio web para enviar una nueva búsqueda.',
    'noMatch.html': '<p>Hola,</p><p>Buscamos en el Registro Público "<strong>{searchLabel}</strong>" pero no encontramos ninguna coincidencia.</p><p>Por favor responda a este correo con los datos corregidos y lo intentaremos de nuevo, o visite el sitio web para enviar una nueva búsqueda.</p>',

    'noMatchRepeat.subject': 'Seguimos sin encontrar una coincidencia para {searchLabel} — le ayudamos',
    'noMatchRepeat.text': 'Hola,\n\nBuscamos de nuevo "{searchLabel}" pero seguimos sin encontrar una coincidencia.\n\nPor favor responda a este correo, o escríbanos a operations@atlaspanama.com, con toda la información que tenga sobre la propiedad o entidad (nombre legal completo, RUC, número de Folio, nombre del propietario — cualquier dato que pueda ayudar). Le ayudaremos a encontrarla, sin costo alguno.',
    'noMatchRepeat.html': '<p>Hola,</p><p>Buscamos de nuevo "<strong>{searchLabel}</strong>" pero seguimos sin encontrar una coincidencia.</p><p>Por favor responda a este correo, o escríbanos a <a href="mailto:operations@atlaspanama.com">operations@atlaspanama.com</a>, con toda la información que tenga sobre la propiedad o entidad (nombre legal completo, RUC, número de Folio, nombre del propietario — cualquier dato que pueda ayudar). Le ayudaremos a encontrarla, sin costo alguno.</p>',

    'refine.subject': 'Demasiadas coincidencias para {searchLabel} — por favor refine su búsqueda',
    'refine.text': 'Hola,\n\nSu búsqueda de "{searchLabel}" arrojó demasiados resultados para mostrarlos individualmente.\n\nPor favor responda a este correo con {refineHint}, y lo intentaremos de nuevo.',
    'refine.html': '<p>Hola,</p><p>Su búsqueda de "<strong>{searchLabel}</strong>" arrojó demasiados resultados para mostrarlos individualmente.</p><p>Por favor responda a este correo con {refineHint}, y lo intentaremos de nuevo.</p>',
    'refine.textInmueble': 'Hola,\n\nSu búsqueda de "{searchLabel}" encontró demasiadas propiedades para mostrarlas individualmente.\n\nPor favor busque de nuevo usando al menos 2 de estos 3 datos:\n- Folio\n- Código de Ubicación\n- Nombre del Propietario\n\nBusque de nuevo aquí: {url}\n\nSi aún no la encuentra, escríbanos a operations@atlaspanama.com con lo que sepa de la propiedad y le ayudamos.\n\n— Atlas Panama',
    'refine.htmlInmueble': '<p>Hola,</p><p>Su búsqueda de "<strong>{searchLabel}</strong>" encontró demasiadas propiedades para mostrarlas individualmente.</p><p>Por favor busque de nuevo usando <strong>al menos 2 de estos 3 datos</strong>:</p><ul><li>Folio</li><li>Código de Ubicación</li><li>Nombre del Propietario</li></ul><p><a href="{url}" style="display:inline-block;padding:12px 22px;background:#667eea;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Buscar de nuevo</a></p><p style="color:#777;font-size:13px;">Si aún no la encuentra, escríbanos a operations@atlaspanama.com con lo que sepa de la propiedad y le ayudamos.</p><p>— Atlas Panama</p>',
    'refine.textEntity': 'Hola,\n\nSu búsqueda de "{searchLabel}" encontró demasiadas sociedades o fundaciones para mostrarlas individualmente.\n\nPor favor busque de nuevo con el nombre completo tal como está inscrito (por ejemplo "Mi Empresa, S.A."), o con el RUC completo.\n\nBusque de nuevo aquí: {url}\n\nSi aún no la encuentra, escríbanos a operations@atlaspanama.com y le ayudamos.\n\n— Atlas Panama',
    'refine.htmlEntity': '<p>Hola,</p><p>Su búsqueda de "<strong>{searchLabel}</strong>" encontró demasiadas sociedades o fundaciones para mostrarlas individualmente.</p><p>Por favor busque de nuevo con el <strong>nombre completo tal como está inscrito</strong> (por ejemplo "Mi Empresa, S.A."), o con el <strong>RUC completo</strong>.</p><p><a href="{url}" style="display:inline-block;padding:12px 22px;background:#667eea;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Buscar de nuevo</a></p><p style="color:#777;font-size:13px;">Si aún no la encuentra, escríbanos a operations@atlaspanama.com y le ayudamos.</p><p>— Atlas Panama</p>',
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
    'verify.buttonLabelTrial': 'Confirmar correo y empezar mis 30 días gratis',
    'verify.buttonSubTrial': 'Sin tarjeta de crédito. Al hacer clic confirmamos que su correo funciona; un clic más y empezamos a revisar su registro todos los días. ¿Problemas con el botón? Copie este enlace en su navegador:',
    'verify.linkTextPrefixTrial': 'Confirmar correo y empezar mis 30 días gratis (sin tarjeta):',

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
    'monitor.noChangesText': 'Sin cambios hoy para {displayName}. Revisamos el Registro Público y todo se ve igual que en nuestra última revisión, realizada el {previousDate}.\n\nEl PDF adjunto muestra el registro actual para su archivo.\n',
    'monitor.noChangesHtml': '<h2>Sin cambios — {displayName}</h2><p>Revisamos el Registro Público para <strong>{displayName}</strong> hoy y todo se ve igual que en nuestra última revisión, realizada el {previousDate}.</p><p>El PDF adjunto muestra el registro actual para su archivo.</p>',
    'monitor.disclaimerText': 'IMPORTANTE: Si usted no autorizó o no reconoce un cambio descrito arriba, por favor contacte a su abogado o contador de inmediato — podría afectar sus derechos de propiedad.',
    'monitor.disclaimerHtml': '<div style="margin-top:20px;padding:12px;border:2px solid #e74c3c;background:#fdecea;font-size:12px;color:#922;"><strong>Importante:</strong> Si usted no autorizó o no reconoce un cambio descrito arriba, por favor contacte a su abogado o contador de inmediato — podría afectar sus derechos de propiedad.</div>',

    'monitor.referralText': 'Si esta suscripción le es de valor, le agradeceríamos mucho que nos recomiende a un amigo o colega — puede suscribirse aquí: {subscribeUrl}\n',
    'monitor.referralHtml': '<p style="margin-top:16px;color:#555;">Si esta suscripción le es de valor, le agradeceríamos mucho que nos recomiende a un amigo o colega — puede suscribirse aquí: <a href="{subscribeUrl}">{subscribeUrl}</a></p>',

    'digest.subjectAllClear': '✅ Atlas Panama: Actualización — {count} propiedades/entidades, sin cambios',
    'digest.subjectOneChange': '⚠️ CAMBIO DETECTADO: {displayName} — Atlas Panama',
    'digest.subjectSomeChanges': '⚠️ CAMBIOS DETECTADOS en {changedCount} de sus {count} propiedades/entidades — Atlas Panama',
    'digest.subjectAllClearOne': '✅ Atlas Panama: Actualización — {displayName}, sin cambios',
    'digest.introAllClearOne': 'Aquí tiene su actualización de {displayName}. No ha cambiado nada desde nuestra última revisión.',
    'digest.introWithNewOne': 'Aquí tiene su primera actualización de {displayName}. La revisión de hoy es el punto de partida con el que compararemos las futuras.',
    'digest.introOneChangeOne': 'Detectamos un cambio en {displayName}. Vea el detalle abajo; el registro completo va adjunto en PDF.',
    'digest.introAllClear': 'Aquí tiene su actualización de las {count} propiedades/entidades que monitoreamos para usted. Nada ha cambiado desde nuestra última revisión de cada una.',
    'digest.introWithNew': 'Aquí tiene su actualización de las {count} propiedades/entidades que monitoreamos para usted. No se encontraron cambios. Lo marcado con 🆕 se revisó hoy por primera vez; esa revisión es el punto de partida con el que compararemos las futuras.',
    'digest.introSomeChanges': 'Aquí tiene su actualización de las {count} propiedades/entidades que monitoreamos para usted. {changedCount} de ellas cambiaron — vea abajo, con el PDF completo adjunto para cada una.',
    'digest.itemNoChange': '✅ {displayName} — sin cambios desde {previousDate}.',
    'digest.itemFirstRun': '🆕 {displayName} — el monitoreo inició hoy; este es el registro base con el que compararemos futuras revisiones.',
    'digest.itemChangeHeader': '⚠️ CAMBIO DETECTADO — {displayName}:',
    'digest.cadenceNote': 'Revisamos el Registro Público todos los días para todas sus propiedades y entidades. Las actualizaciones rutinarias como esta se envían de forma {frequency} — pero si algo realmente cambia, le enviamos un correo de inmediato, sin importar el calendario.',
    'digest.frequencyWeekly': 'semanal',
    'digest.noAttachmentNote': ' No hemos adjuntado aquí los PDF de las propiedades o entidades sin cambios — solo adjuntamos los PDF cuando hay cambios.',

    'welcome.subject': 'Bienvenido a Atlas Panama — ya estamos monitoreando {displayName}',
    'welcome.text': '¡Bienvenido a Atlas Panama!\n\nSu suscripción para {displayName} ya está activa. Revisamos el Registro Público de Panamá todos los días — pero para no saturar su bandeja de entrada, solo enviamos una actualización rutinaria semanal. Sin embargo, si algo realmente cambia, le enviamos un correo de inmediato, sin importar ese calendario.\n{paymentDetails}\nAl suscribirse, usted aceptó nuestros Términos y Condiciones: {tosUrl} Le recomendamos guardar este correo para sus registros.\n\nEsperamos que esta suscripción le sea de valor. Si es así, le agradeceríamos mucho que nos recomiende a un amigo o colega — puede suscribirse aquí: {subscribeUrl}\n\n¡Gracias por ser uno de nuestros primeros suscriptores!\n— Atlas Panama',
    'welcome.html': '<h2>¡Bienvenido a Atlas Panama!</h2><p>Su suscripción para <strong>{displayName}</strong> ya está activa. Revisamos el Registro Público de Panamá todos los días — pero para no saturar su bandeja de entrada, solo enviamos una actualización rutinaria semanal. Sin embargo, si algo realmente cambia, le enviamos un correo de inmediato, sin importar ese calendario.</p>{paymentDetailsHtml}<p style="color:#666;font-size:13px;">Al suscribirse, usted aceptó nuestros <a href="{tosUrl}">Términos y Condiciones</a>. Le recomendamos guardar este correo para sus registros.</p><p>Esperamos que esta suscripción le sea de valor. Si es así, le agradeceríamos mucho que nos recomiende a un amigo o colega — puede suscribirse aquí: <a href="{subscribeUrl}">{subscribeUrl}</a></p><p>¡Gracias por ser uno de nuestros primeros suscriptores!<br>— Atlas Panama</p>',
    'welcome.paymentDetailsText': 'Plan: {planLabel}. Próxima renovación: {renewalDate}.\n',
    'welcome.trialNoCardDetailsText': 'Prueba gratis: 30 días, sin tarjeta, hasta el {trialEnd}. Le escribiremos 5 días y 1 día antes de que termine para que elija un plan ($1 al mes o $10 al año) si desea continuar.\n',
    'welcome.trialNoCardDetailsHtml': '<p>🎁 <strong>Prueba gratis: 30 días, sin tarjeta</strong>, hasta el <strong>{trialEnd}</strong>. Le escribiremos 5 días y 1 día antes de que termine para que elija un plan ($1 al mes o $10 al año) si desea continuar.</p>',
    'noCardTrial.ending5Subject': 'Su prueba gratis para {displayName} termina en 5 días',
    'noCardTrial.ending5Text': 'Hola,\n\nSu prueba gratis de 30 días para {displayName} termina el {trialEnd}. Para seguir recibiendo el monitoreo diario del Registro Público y las alertas, elija un plan abajo. Si lo elige ahora, no se le cobrará hasta que termine su prueba gratis.',
    'noCardTrial.ending5Html': '<p>Hola,</p><p>Su prueba gratis de 30 días para <strong>{displayName}</strong> termina el <strong>{trialEnd}</strong>. Para seguir recibiendo el monitoreo diario del Registro Público y las alertas, elija un plan abajo. Si lo elige ahora, no se le cobrará hasta que termine su prueba gratis.</p>',
    'noCardTrial.ending1Subject': 'Último día: su prueba gratis para {displayName} termina mañana',
    'noCardTrial.ending1Text': 'Hola,\n\nSu prueba gratis para {displayName} termina el {trialEnd}. Elija un plan para que su propiedad o sociedad siga vigilada todos los días. Si no lo hace, el monitoreo se detendrá al terminar la prueba.',
    'noCardTrial.ending1Html': '<p>Hola,</p><p>Su prueba gratis para <strong>{displayName}</strong> termina el <strong>{trialEnd}</strong>. Elija un plan para que su propiedad o sociedad siga vigilada todos los días. Si no lo hace, el monitoreo se detendrá al terminar la prueba.</p>',
    'noCardTrial.expiredSubject': 'Monitoreo en pausa para {displayName}: su prueba gratis terminó',
    'noCardTrial.expiredText': 'Hola,\n\nSu prueba gratis para {displayName} terminó el {trialEnd}, así que dejamos de revisar el Registro Público para este registro. Puede reactivar el monitoreo en cualquier momento eligiendo un plan abajo.',
    'noCardTrial.expiredHtml': '<p>Hola,</p><p>Su prueba gratis para <strong>{displayName}</strong> terminó el <strong>{trialEnd}</strong>, así que dejamos de revisar el Registro Público para este registro. Puede reactivar el monitoreo en cualquier momento eligiendo un plan abajo.</p>',
    'noCardTrial.buttonsText': 'Mensual, $1 al mes: {monthlyUrl}\nAnual, $10 al año: {annualUrl}',
    'noCardTrial.buttonsHtml': '<p><a href="{monthlyUrl}" style="display:inline-block;margin:6px 8px 6px 0;padding:12px 20px;background:#667eea;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">$1 / mes</a><a href="{annualUrl}" style="display:inline-block;margin:6px 8px 6px 0;padding:12px 20px;background:#667eea;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">$10 / año</a></p>',
    'noCardTrial.trustText': 'El pago lo procesa de forma segura Stripe, que maneja los pagos de más de 5 millones de empresas en el mundo. Atlas Panama nunca ve ni guarda los datos de su tarjeta.',
    'trialConverted.subject': 'Listo: {displayName} sigue vigilado',
    'trialConverted.text': '¡Gracias! Su plan {planLabel} para {displayName} está activo. Su primer cargo será el {firstCharge}. Administre su suscripción cuando quiera: {manageUrl}\n\n— Atlas Panama',
    'trialConverted.html': '<p>¡Gracias!</p><p>Su plan <strong>{planLabel}</strong> para <strong>{displayName}</strong> está activo. Su primer cargo será el <strong>{firstCharge}</strong>.</p><p><a href="{manageUrl}">Administrar mi suscripción</a></p><p>— Atlas Panama</p>',
    'lead.subject': 'Su enlace para completar su suscripción a Atlas Panama',
    'lead.text': 'Hola,\n\nAquí tiene el enlace para completar su suscripción a Atlas Panama cuando tenga a mano los datos de su propiedad o sociedad (el Folio o el nombre del propietario para una propiedad; el nombre o el RUC para una sociedad o fundación):\n\n{url}\n\nLos primeros 30 días son gratis.\n\n— Atlas Panama',
    'lead.html': '<p>Hola,</p><p>Aquí tiene el enlace para completar su suscripción a Atlas Panama cuando tenga a mano los datos de su propiedad o sociedad (el Folio o el nombre del propietario para una propiedad; el nombre o el RUC para una sociedad o fundación).</p><p><a href="{url}" style="display:inline-block;padding:12px 22px;background:#667eea;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Completar mi suscripción</a></p><p>Los primeros 30 días son gratis.</p><p>— Atlas Panama</p>',
    'lead.reminderSubject': 'Recordatorio: proteja su propiedad en Panamá, 30 días gratis',
    'lead.reminderText': 'Hola,\n\nAyer nos pidió el enlace para suscribirse a Atlas Panama. Cuando tenga un minuto (y el Folio, el nombre del propietario o de la sociedad), puede completarlo aquí:\n\n{url}\n\nRevisamos el Registro Público todos los días y le avisamos por correo apenas algo cambia. Los primeros 30 días son gratis.\n\nEste es el único recordatorio que le enviaremos.\n\n— Atlas Panama',
    'lead.reminderHtml': '<p>Hola,</p><p>Ayer nos pidió el enlace para suscribirse a Atlas Panama. Cuando tenga un minuto (y el Folio, el nombre del propietario o de la sociedad), puede completarlo aquí:</p><p><a href="{url}" style="display:inline-block;padding:12px 22px;background:#667eea;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Completar mi suscripción</a></p><p>Revisamos el Registro Público todos los días y le avisamos por correo apenas algo cambia. <strong>Los primeros 30 días son gratis.</strong></p><p style="color:#777;font-size:12px;">Este es el único recordatorio que le enviaremos.</p><p>— Atlas Panama</p>',
    'welcome.trialDetailsText': 'Prueba gratis: sin cargo hasta el {trialEnd}. Después, {planLabel}, con renovación automática (puede cancelar antes de esa fecha sin costo).\n',
    'welcome.trialDetailsHtml': '<p>🎁 <strong>Prueba gratis:</strong> sin cargo hasta el <strong>{trialEnd}</strong>. Después, {planLabel}, con renovación automática. Puede cancelar antes de esa fecha sin costo.</p>',
    'welcome.trialCardReusedText': 'Esta tarjeta ya se utilizó para una prueba gratis, por lo que el cobro comenzó hoy. Plan: {planLabel}. Próxima renovación: {renewalDate}.\n',
    'welcome.trialCardReusedHtml': '<p>Esta tarjeta ya se utilizó para una prueba gratis, por lo que el cobro comenzó hoy.<br><strong>Plan:</strong> {planLabel} &nbsp;|&nbsp; <strong>Próxima renovación:</strong> {renewalDate}</p>',
    'trialEnding.subject': 'Su prueba gratis de Atlas Panama termina el {trialEnd}: {displayName}',
    'trialEnding.text': 'Hola,\n\nSu prueba gratis para {displayName} termina el {trialEnd}. Ese día su suscripción continúa automáticamente a {planLabel}, con cargo a la tarjeta que nos proporcionó.\n\nSi desea seguir con el monitoreo, no tiene que hacer nada. Para cancelar antes de esa fecha sin costo, use este enlace: {manageUrl}\n\n— Atlas Panama',
    'trialEnding.html': '<p>Hola,</p><p>Su prueba gratis para <strong>{displayName}</strong> termina el <strong>{trialEnd}</strong>. Ese día su suscripción continúa automáticamente a <strong>{planLabel}</strong>, con cargo a la tarjeta que nos proporcionó.</p><p>Si desea seguir con el monitoreo, no tiene que hacer nada. Para cancelar antes de esa fecha sin costo: <a href="{manageUrl}">Administrar mi suscripción</a></p><p>— Atlas Panama</p>',
    'manage.linkLabel': 'Administrar suscripción (tarjeta, facturas, cancelar)',
    'manage.welcomeText': 'Para actualizar su tarjeta, ver sus facturas o cancelar en cualquier momento: {manageUrl}\n',
    'manage.welcomeHtml': '<p>Para actualizar su tarjeta, ver sus facturas o cancelar en cualquier momento: <a href="{manageUrl}">Administrar mi suscripción</a></p>',
    'welcome.paymentDetailsHtml': '<p><strong>Plan:</strong> {planLabel} &nbsp;|&nbsp; <strong>Próxima renovación:</strong> {renewalDate}</p>',

    'pdf.defaultTitle': 'Informe de Registro de Atlas Panama',
    'pdf.removedEntries': 'Entradas que ya no aparecen (eliminadas desde la última revisión):',
    'pdf.reviewLabel': 'Fecha de revisión del Registro Público',
    'pdf.generatedLabel': 'Generado',
    'pdf.noEntries': 'No se encontraron entradas.',
    'pdf.whatChanged': 'Qué cambió:',
    'pdf.noChangesSince': 'Sin cambios desde nuestra última revisión, realizada el {previousDate}.',
    'pdf.firstCheck': 'Esta es la primera revisión de este registro — guardada como referencia para futuras comparaciones.',
    'pdf.disclaimerImportant': 'Importante:',
    'pdf.disclaimerBody': 'Si usted no autorizó o no reconoce un cambio reflejado en este registro, por favor contacte a su abogado o contador de inmediato — podría afectar sus derechos de propiedad.',

    'date.months': 'enero,febrero,marzo,abril,mayo,junio,julio,agosto,septiembre,octubre,noviembre,diciembre',
    'date.format': '{day} de {month} de {year}'
  }
};

/**
 * Formats a "YYYY-MM-DD" date string (as produced by lib/snapshotStore.js's
 * todayDateString()) into a locale-appropriate display string, WITHOUT going
 * through a Date object/timezone conversion — the string already represents a
 * specific Panama calendar date, so this just re-labels it, never shifts it.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {'es'|'en'} lang
 */
export function formatDateForLang(dateStr, lang) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const months = t(lang, 'date.months').split(',');
  const monthName = months[month - 1] || month;
  return t(lang, 'date.format', { day: String(day), month: monthName, year: String(year) });
}

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

export default { t, formatDateForLang };
