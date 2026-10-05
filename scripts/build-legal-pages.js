#!/usr/bin/env node
// Generates the public legal pages from one source of truth (the clause data below):
//   public/terminos.html   — Terms, Spanish only (the governing text)
//   public/privacidad.html — Privacy Policy, Spanish only (the governing text)
//   public/terms.html      — Terms, bilingual: each clause in English, then Spanish
//   public/privacy.html    — Privacy Policy, bilingual, same layout
//   legal/TERMINOS_Bilingue.md, legal/PRIVACIDAD_Bilingue.md — same content, for attorney review
//
// Spanish is the legal language in Panama; the English text is a convenience
// translation and the bilingual pages say the Spanish version prevails.
// Source drafts: legal/TOS_Borrador.md and legal/POLITICA_DE_PRIVACIDAD_BORRADOR.md.
// Pending attorney review — when their edits come back, change the clauses here
// and rerun:  node scripts/build-legal-pages.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EFFECTIVE = { es: '3 de octubre de 2026', en: 'October 3, 2026' };
const UPDATED = { es: '4 de octubre de 2026', en: 'October 4, 2026' };
const CONTACT = {
  es: 'Atlas Panama LLC, 800 Silks Run #1353, Hallandale Beach, FL 33009, Estados Unidos — <a href="mailto:operations@atlaspanama.com">operations@atlaspanama.com</a>',
  en: 'Atlas Panama LLC, 800 Silks Run #1353, Hallandale Beach, FL 33009, United States — <a href="mailto:operations@atlaspanama.com">operations@atlaspanama.com</a>',
};

// Each clause: { es: { h, p: [paragraphs] }, en: { h, p: [...] } }. Paragraphs may
// contain <strong> and <a>; nothing here is user input.
const TERMS = {
  slugEs: 'terminos', slugEn: 'terms', md: 'TERMINOS_Bilingue.md',
  title: { es: 'Términos y Condiciones de Uso y Suscripción', en: 'Terms of Use and Subscription' },
  intro: null,
  clauses: [
    {
      es: { h: 'Aceptación de los Términos', p: [
        'Al registrarse, suscribirse o utilizar de cualquier forma la plataforma Atlas Panama (en adelante, "la Plataforma", "el Servicio" o "Atlas Panama"), operada por Atlas Panama LLC, sociedad de responsabilidad limitada registrada en el Estado de Florida, Estados Unidos de América, usted (en adelante, "el Suscriptor" o "usted") acepta estar sujeto a estos Términos y Condiciones (en adelante, "los Términos"), así como a la <a href="/privacidad">Política de Privacidad</a> de Atlas Panama, la cual se incorpora por referencia. Si usted no está de acuerdo con estos Términos, no debe utilizar el Servicio.',
      ] },
      en: { h: 'Acceptance of the Terms', p: [
        'By registering for, subscribing to, or using in any way the Atlas Panama platform (hereinafter, the "Platform," the "Service," or "Atlas Panama"), operated by Atlas Panama LLC, a limited liability company registered in the State of Florida, United States of America, you (hereinafter, the "Subscriber" or "you") agree to be bound by these Terms and Conditions (hereinafter, the "Terms"), as well as by the Atlas Panama <a href="/privacy">Privacy Policy</a>, which is incorporated by reference. If you do not agree to these Terms, you must not use the Service.',
      ] },
    },
    {
      es: { h: 'Descripción del Servicio', p: [
        'Atlas Panama es un servicio de suscripción que monitorea periódicamente los registros públicos del Registro Público de Panamá ("el Registro Público" o "RP") correspondientes a bienes inmuebles (fincas/folios) y personas jurídicas (sociedades anónimas, fundaciones de interés privado, y figuras similares) que el Suscriptor haya registrado en la Plataforma, con el fin de notificarle sobre cambios detectados en dichos registros.',
        'El Servicio incluye, entre otros: verificación diaria de los registros seleccionados; generación de reportes en formato PDF con la información extraída; y notificaciones por correo electrónico según la frecuencia aplicable a la suscripción del usuario.',
      ] },
      en: { h: 'Description of the Service', p: [
        'Atlas Panama is a subscription service that periodically monitors the public records of the Public Registry of Panama (the "Public Registry" or "RP") for real property (fincas/folios) and legal entities (corporations (sociedades anónimas), private interest foundations, and similar entities) that the Subscriber has registered on the Platform, in order to notify the Subscriber of changes detected in those records.',
        'The Service includes, among other things: a daily check of the selected records; PDF reports containing the extracted information; and email notifications according to the frequency applicable to the user\'s subscription.',
      ] },
    },
    {
      es: { h: 'Idoneidad y Declaración de Interés Legítimo', p: [
        'Al registrar un bien inmueble o una persona jurídica para su monitoreo, usted declara y garantiza que tiene un interés legítimo en dicho bien o entidad — ya sea como propietario, representante autorizado, abogado, comprador o inversionista potencial, acreedor, prestamista, u otro interés de buena fe de naturaleza personal, comercial, financiera, legal o profesional.',
        'Usted declara que no utilizará el Servicio para acosar, vigilar indebidamente o violar los derechos de privacidad de ninguna persona natural específica, ni para facilitar fraude, extorsión, coacción o cualquier otro propósito ilícito.',
      ] },
      en: { h: 'Eligibility and Representation of Legitimate Interest', p: [
        'By registering a real property or a legal entity for monitoring, you represent and warrant that you have a legitimate interest in that property or entity — whether as owner, authorized representative, attorney, prospective buyer or investor, creditor, lender, or any other good-faith interest of a personal, commercial, financial, legal, or professional nature.',
        'You represent that you will not use the Service to harass, improperly surveil, or violate the privacy rights of any specific natural person, or to facilitate fraud, extortion, coercion, or any other unlawful purpose.',
      ] },
    },
    {
      es: { h: 'Uso Aceptable', p: [
        'El Suscriptor se compromete a utilizar el Servicio únicamente para fines lícitos. Queda prohibido: (a) utilizar el Servicio para cualquier propósito ilegal o no autorizado; (b) revender, redistribuir o explotar comercialmente los datos obtenidos a través del Servicio sin autorización expresa de Atlas Panama; (c) intentar extraer, copiar o acceder a la Plataforma o a sus datos mediante medios automatizados no autorizados (scraping, bots, etc.) distintos al uso normal del Servicio; (d) utilizar el Servicio para vigilar, acosar o de cualquier forma vulnerar los derechos de terceros.',
      ] },
      en: { h: 'Acceptable Use', p: [
        'The Subscriber agrees to use the Service only for lawful purposes. The following are prohibited: (a) using the Service for any illegal or unauthorized purpose; (b) reselling, redistributing, or commercially exploiting data obtained through the Service without the express authorization of Atlas Panama; (c) attempting to extract, copy, or access the Platform or its data through unauthorized automated means (scraping, bots, etc.) other than normal use of the Service; (d) using the Service to monitor, harass, or in any way infringe the rights of third parties.',
      ] },
    },
    {
      es: { h: 'Exclusión de Garantías', p: [
        'EL SERVICIO SE PROPORCIONA "TAL CUAL" Y "SEGÚN DISPONIBILIDAD", SIN GARANTÍAS DE NINGÚN TIPO, YA SEAN EXPRESAS O IMPLÍCITAS, INCLUYENDO, SIN LIMITARSE A, GARANTÍAS DE COMERCIABILIDAD, IDONEIDAD PARA UN PROPÓSITO PARTICULAR, O NO INFRACCIÓN.',
      ] },
      en: { h: 'Disclaimer of Warranties', p: [
        'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING, WITHOUT LIMITATION, WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.',
      ] },
    },
    {
      es: { h: 'Exactitud, Integridad y Oportunidad de la Información', p: [
        'Atlas Panama obtiene y procesa información directamente del Registro Público. <strong>Atlas Panama no garantiza la exactitud, integridad, actualidad o disponibilidad continua de dicha información.</strong> El Suscriptor reconoce y acepta que:',
        '(a) El propio Registro Público puede contener errores, retrasos o discrepancias que están fuera del control de Atlas Panama.',
        '(b) Los procesos de consulta pueden fallar temporalmente, verse interrumpidos, o encontrarse con cambios técnicos en los sistemas del Registro Público, lo cual <strong>podría resultar en que una notificación se retrase o, en casos excepcionales, no se genere.</strong>',
        '(c) El Servicio es una herramienta de monitoreo y no sustituye la verificación directa e independiente por parte del Suscriptor ante el Registro Público, especialmente en decisiones legales, financieras o de negocios de importancia.',
      ] },
      en: { h: 'Accuracy, Completeness, and Timeliness of Information', p: [
        'Atlas Panama obtains and processes information directly from the Public Registry. <strong>Atlas Panama does not guarantee the accuracy, completeness, timeliness, or continuous availability of that information.</strong> The Subscriber acknowledges and agrees that:',
        '(a) The Public Registry itself may contain errors, delays, or discrepancies that are beyond the control of Atlas Panama.',
        '(b) Lookup processes may temporarily fail, be interrupted, or encounter technical changes in the Public Registry\'s systems, which <strong>could result in a notification being delayed or, in exceptional cases, not being generated.</strong>',
        '(c) The Service is a monitoring tool and does not replace direct and independent verification by the Subscriber with the Public Registry, especially for important legal, financial, or business decisions.',
      ] },
    },
    {
      es: { h: 'No Constituye Asesoría Legal, Financiera o Profesional', p: [
        'La información y las notificaciones proporcionadas por Atlas Panama tienen fines informativos únicamente y <strong>no constituyen asesoría legal, financiera, contable o de ningún otro tipo profesional.</strong> Si el Suscriptor no reconoce o no autorizó un cambio detectado en su registro, debe contactar de inmediato a un abogado o contador de su elección. El uso del Servicio no crea una relación de abogado-cliente, asesor-cliente, ni ninguna relación fiduciaria entre el Suscriptor y Atlas Panama.',
      ] },
      en: { h: 'Not Legal, Financial, or Professional Advice', p: [
        'The information and notifications provided by Atlas Panama are for informational purposes only and <strong>do not constitute legal, financial, accounting, or any other type of professional advice.</strong> If the Subscriber does not recognize or did not authorize a change detected in their record, they should immediately contact an attorney or accountant of their choice. Use of the Service does not create an attorney-client, advisor-client, or any fiduciary relationship between the Subscriber and Atlas Panama.',
      ] },
    },
    {
      es: { h: 'Limitación de Responsabilidad', p: [
        'EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY APLICABLE, LA RESPONSABILIDAD TOTAL DE ATLAS PANAMA ANTE EL SUSCRIPTOR POR CUALQUIER RECLAMO DERIVADO DEL USO DEL SERVICIO <strong>NO EXCEDERÁ EL MONTO TOTAL PAGADO POR EL SUSCRIPTOR A ATLAS PANAMA DURANTE LOS DOCE (12) MESES ANTERIORES AL RECLAMO.</strong>',
        'Atlas Panama no será responsable, bajo ninguna circunstancia, por daños indirectos, incidentales, especiales, consecuentes, punitivos, o por lucro cesante, pérdida de datos, pérdida de oportunidad de negocio, o pérdida de valor de un bien inmueble o entidad, aun cuando se haya advertido de la posibilidad de dichos daños.',
      ] },
      en: { h: 'Limitation of Liability', p: [
        'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE TOTAL LIABILITY OF ATLAS PANAMA TO THE SUBSCRIBER FOR ANY CLAIM ARISING FROM THE USE OF THE SERVICE <strong>SHALL NOT EXCEED THE TOTAL AMOUNT PAID BY THE SUBSCRIBER TO ATLAS PANAMA DURING THE TWELVE (12) MONTHS PRECEDING THE CLAIM.</strong>',
        'Under no circumstances shall Atlas Panama be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, loss of data, loss of business opportunity, or loss of value of a real property or entity, even if advised of the possibility of such damages.',
      ] },
    },
    {
      es: { h: 'Dependencia de Terceros — Registro Público', p: [
        'El Suscriptor reconoce que el funcionamiento del Servicio depende de la disponibilidad continua y del correcto funcionamiento de los sistemas públicos del Registro Público de Panamá, los cuales <strong>no son operados ni controlados por Atlas Panama.</strong> Interrupciones, cambios de política, restricciones de acceso, o modificaciones técnicas por parte del Registro Público que afecten el Servicio están fuera del control de Atlas Panama y no generarán responsabilidad alguna para esta.',
      ] },
      en: { h: 'Third-Party Dependency — Public Registry', p: [
        'The Subscriber acknowledges that the operation of the Service depends on the continuous availability and proper functioning of the public systems of the Public Registry of Panama, which <strong>are not operated or controlled by Atlas Panama.</strong> Interruptions, policy changes, access restrictions, or technical modifications by the Public Registry that affect the Service are beyond the control of Atlas Panama and shall not give rise to any liability on its part.',
      ] },
    },
    {
      es: { h: 'Publicidad de Terceros en las Comunicaciones', p: [
        'Atlas Panama se reserva el derecho de incluir contenido publicitario o patrocinado de terceros (por ejemplo, abogados, contadores, constructores, arquitectos u otros profesionales afines) dentro de sus comunicaciones por correo electrónico. Dicho contenido publicitario se presentará de forma claramente distinguible del contenido informativo propio del Servicio (alertas y reportes de monitoreo), y Atlas Panama no compartirá la información personal del Suscriptor con dichos terceros anunciantes sin el consentimiento expreso del Suscriptor.',
      ] },
      en: { h: 'Third-Party Advertising in Communications', p: [
        'Atlas Panama reserves the right to include third-party advertising or sponsored content (for example, from attorneys, accountants, builders, architects, or other related professionals) in its email communications. Such advertising content will be presented in a manner clearly distinguishable from the Service\'s own informational content (monitoring alerts and reports), and Atlas Panama will not share the Subscriber\'s personal information with such third-party advertisers without the Subscriber\'s express consent.',
      ] },
    },
    {
      es: { h: 'Suscripción, Renovación Automática, Cancelación y Reembolsos', p: [
        'El Servicio se ofrece mediante planes de suscripción mensual o anual, según se detalla en la Plataforma. Las suscripciones <strong>se renuevan automáticamente</strong> al final de cada período, salvo que el Suscriptor las cancele previamente mediante el enlace "Administrar suscripción" incluido en cada correo electrónico que Atlas Panama le envía. La cancelación surtirá efecto al final del período de facturación vigente.',
        '<strong>Prueba gratis.</strong> La primera suscripción de cada Suscriptor incluye una prueba gratis de treinta (30) días. Se requiere una tarjeta de pago válida al suscribirse, pero no se realiza ningún cargo durante la prueba. Al terminar la prueba, la suscripción continúa automáticamente al precio del plan elegido, salvo que el Suscriptor la cancele antes de su vencimiento, en cuyo caso no se realiza ningún cargo. Se permite una sola prueba gratis por persona, por dirección de correo electrónico y por tarjeta; si la tarjeta o el correo ya se utilizaron para una prueba gratis, el cobro comienza de inmediato. Las suscripciones adicionales del mismo Suscriptor se facturan desde el primer día.',
        '<strong>No se ofrecen reembolsos, totales ni parciales, por períodos ya facturados</strong>, salvo que la ley aplicable exija lo contrario.',
        'Si el Suscriptor no renueva el pago de su suscripción antes de su vencimiento, su información será eliminada de los archivos de Atlas Panama transcurridos dos (2) meses, conforme a la <a href="/privacidad">Política de Privacidad</a>.',
      ] },
      en: { h: 'Subscription, Automatic Renewal, Cancellation, and Refunds', p: [
        'The Service is offered through monthly or annual subscription plans, as described on the Platform. Subscriptions <strong>renew automatically</strong> at the end of each period unless the Subscriber cancels beforehand using the "Manage subscription" link included in every email Atlas Panama sends them. Cancellation takes effect at the end of the current billing period.',
        '<strong>Free trial.</strong> Each Subscriber\'s first subscription includes a thirty (30) day free trial. A valid payment card is required to subscribe, but no charge is made during the trial. When the trial ends, the subscription continues automatically at the price of the chosen plan, unless the Subscriber cancels before it ends, in which case no charge is made. Only one free trial is allowed per person, per email address, and per card; if the card or email was already used for a free trial, billing starts immediately. Additional subscriptions by the same Subscriber are billed from day one.',
        '<strong>No refunds, whether full or partial, are offered for periods already billed</strong>, unless applicable law requires otherwise.',
        'If the Subscriber does not renew payment of their subscription before it expires, their information will be deleted from Atlas Panama\'s files after two (2) months, in accordance with the <a href="/privacy">Privacy Policy</a>.',
      ] },
    },
    {
      es: { h: 'Modificación, Suspensión y Terminación del Servicio; Cambios de Precio', p: [
        'Atlas Panama se reserva el derecho de modificar, suspender o discontinuar el Servicio, en todo o en parte, en cualquier momento, con o sin previo aviso. Atlas Panama también se reserva el derecho de modificar los precios de sus planes de suscripción; dichos cambios se notificarán con antelación razonable y no afectarán los períodos ya pagados por el Suscriptor.',
      ] },
      en: { h: 'Modification, Suspension, and Termination of the Service; Price Changes', p: [
        'Atlas Panama reserves the right to modify, suspend, or discontinue the Service, in whole or in part, at any time, with or without prior notice. Atlas Panama also reserves the right to change the prices of its subscription plans; such changes will be notified with reasonable advance notice and will not affect periods already paid for by the Subscriber.',
      ] },
    },
    {
      es: { h: 'Privacidad', p: [
        'El tratamiento de los datos personales del Suscriptor se rige por la <a href="/privacidad">Política de Privacidad</a> de Atlas Panama, la cual se incorpora por referencia a estos Términos.',
      ] },
      en: { h: 'Privacy', p: [
        'The processing of the Subscriber\'s personal data is governed by the Atlas Panama <a href="/privacy">Privacy Policy</a>, which is incorporated into these Terms by reference.',
      ] },
    },
    {
      es: { h: 'Indemnización', p: [
        'El Suscriptor se compromete a indemnizar y mantener indemne a Atlas Panama frente a cualquier reclamo, daño, pérdida o gasto (incluyendo honorarios legales razonables) que surja del uso indebido del Servicio por parte del Suscriptor o de la violación de estos Términos.',
      ] },
      en: { h: 'Indemnification', p: [
        'The Subscriber agrees to indemnify and hold Atlas Panama harmless from any claim, damage, loss, or expense (including reasonable attorneys\' fees) arising from the Subscriber\'s misuse of the Service or violation of these Terms.',
      ] },
    },
    {
      es: { h: 'Fuerza Mayor', p: [
        'Atlas Panama no será responsable por el incumplimiento o retraso en la prestación del Servicio derivado de causas fuera de su control razonable, incluyendo, sin limitarse a, fallas de internet o de suministro eléctrico, desastres naturales, actos gubernamentales, o interrupciones de los sistemas del Registro Público.',
      ] },
      en: { h: 'Force Majeure', p: [
        'Atlas Panama shall not be liable for any failure or delay in providing the Service resulting from causes beyond its reasonable control, including, without limitation, internet or power outages, natural disasters, government actions, or interruptions of the Public Registry\'s systems.',
      ] },
    },
    {
      es: { h: 'Ley Aplicable, Jurisdicción y Arbitraje', p: [
        'Estos Términos se regirán e interpretarán <strong>exclusivamente conforme a las leyes de la República de Panamá</strong>, sin dar efecto a ningún principio de conflicto de leyes que pudiera resultar en la aplicación de las leyes de otra jurisdicción.',
        'Cualquier controversia, reclamo o disputa que surja de o esté relacionada con estos Términos o con el uso del Servicio se resolverá mediante <strong>arbitraje vinculante</strong> en la República de Panamá, cuyos costos serán asumidos en partes iguales por ambas partes, salvo que el tribunal arbitral disponga lo contrario. Queda excluida cualquier acción ante los tribunales ordinarios, salvo en lo que la ley aplicable no permita someter a arbitraje.',
      ] },
      en: { h: 'Governing Law, Jurisdiction, and Arbitration', p: [
        'These Terms shall be governed by and construed <strong>exclusively in accordance with the laws of the Republic of Panama</strong>, without giving effect to any conflict-of-laws principle that could result in the application of the laws of another jurisdiction.',
        'Any controversy, claim, or dispute arising out of or relating to these Terms or the use of the Service shall be resolved by <strong>binding arbitration</strong> in the Republic of Panama, the costs of which shall be borne equally by both parties, unless the arbitral tribunal orders otherwise. Any action before the ordinary courts is excluded, except to the extent applicable law does not permit the matter to be submitted to arbitration.',
      ] },
    },
    {
      es: { h: 'Modificaciones a estos Términos', p: [
        'Atlas Panama podrá actualizar estos Términos de tiempo en tiempo. El uso continuado del Servicio después de la publicación de cambios constituye la aceptación de los Términos modificados.',
      ] },
      en: { h: 'Amendments to these Terms', p: [
        'Atlas Panama may update these Terms from time to time. Continued use of the Service after changes are published constitutes acceptance of the amended Terms.',
      ] },
    },
    {
      es: { h: 'Divisibilidad', p: [
        'Si alguna disposición de estos Términos fuera declarada inválida o inexigible por un tribunal competente, las demás disposiciones permanecerán en pleno vigor y efecto.',
      ] },
      en: { h: 'Severability', p: [
        'If any provision of these Terms is held invalid or unenforceable by a competent tribunal, the remaining provisions shall remain in full force and effect.',
      ] },
    },
    {
      es: { h: 'Acuerdo Íntegro', p: [
        'Estos Términos, junto con la Política de Privacidad, constituyen el acuerdo íntegro entre el Suscriptor y Atlas Panama respecto al uso del Servicio, y sustituyen cualquier acuerdo previo, ya sea verbal o escrito.',
      ] },
      en: { h: 'Entire Agreement', p: [
        'These Terms, together with the Privacy Policy, constitute the entire agreement between the Subscriber and Atlas Panama regarding the use of the Service, and supersede any prior agreement, whether oral or written.',
      ] },
    },
    {
      es: { h: 'Contacto', p: [
        'Para preguntas relacionadas con estos Términos, el Suscriptor puede contactar a: ' + CONTACT.es + '.',
      ] },
      en: { h: 'Contact', p: [
        'For questions regarding these Terms, the Subscriber may contact: ' + CONTACT.en + '.',
      ] },
    },
  ],
};

const PRIVACY = {
  slugEs: 'privacidad', slugEn: 'privacy', md: 'PRIVACIDAD_Bilingue.md',
  title: { es: 'Política de Privacidad', en: 'Privacy Policy' },
  intro: {
    es: 'Esta Política de Privacidad describe cómo Atlas Panama LLC, sociedad de responsabilidad limitada registrada en el Estado de Florida, Estados Unidos de América ("Atlas Panama" o "nosotros") recopila, utiliza y protege la información personal de los usuarios de la plataforma Atlas Panama (el "Servicio").',
    en: 'This Privacy Policy describes how Atlas Panama LLC, a limited liability company registered in the State of Florida, United States of America ("Atlas Panama" or "we") collects, uses, and protects the personal information of users of the Atlas Panama platform (the "Service").',
  },
  clauses: [
    {
      es: { h: 'Información que Recopilamos', p: [
        'Recopilamos únicamente la información necesaria para prestar el Servicio: su correo electrónico; los datos de identificación del bien inmueble o entidad que usted registra para monitoreo (folio, código de ubicación, RUC, nombre); su idioma preferido; y, si usted lo proporciona de forma opcional, su número de teléfono (por ejemplo, para notificaciones vía WhatsApp).',
        'También registramos de forma anónima los términos que se escriben en el buscador de nuestra página de Preguntas Frecuentes, sin vincularlos a ningún usuario, con el fin de mejorar su contenido.',
        'Para aplicar la regla de una prueba gratis por persona, conservamos un código no reversible de su correo electrónico y el identificador de tarjeta que nos proporciona Stripe (no el número de su tarjeta). Estos códigos se conservan aun después de eliminar el resto de su información, únicamente para impedir pruebas gratis repetidas.',
        '<strong>No almacenamos su información de pago.</strong> El procesamiento de pagos lo realiza Stripe, Inc., un tercero, conforme a su propia política de privacidad.',
      ] },
      en: { h: 'Information We Collect', p: [
        'We collect only the information necessary to provide the Service: your email address; the identifying details of the real property or entity you register for monitoring (folio, location code, RUC, name); your preferred language; and, if you optionally provide it, your phone number (for example, for WhatsApp notifications).',
        'We also anonymously record the terms typed into the search box on our Frequently Asked Questions page, without linking them to any user, in order to improve its content.',
        'To enforce the one-free-trial-per-person rule, we keep a non-reversible code of your email address and the card identifier provided by Stripe (not your card number). These codes are kept even after the rest of your information is deleted, solely to prevent repeated free trials.',
        '<strong>We do not store your payment information.</strong> Payments are processed by Stripe, Inc., a third party, under its own privacy policy.',
      ] },
    },
    {
      es: { h: 'Cómo Usamos su Información', p: [
        'Utilizamos su información para: prestar el Servicio (monitoreo del Registro Público y envío de notificaciones); procesar su suscripción y pagos a través de Stripe; y comunicarnos con usted sobre su cuenta.',
      ] },
      en: { h: 'How We Use Your Information', p: [
        'We use your information to: provide the Service (monitoring the Public Registry and sending notifications); process your subscription and payments through Stripe; and communicate with you about your account.',
      ] },
    },
    {
      es: { h: 'Con Quién Compartimos Información', p: [
        'Compartimos información limitada con: <strong>Stripe</strong> (procesamiento de pagos) y <strong>Postmark</strong> (envío de correos electrónicos), ambos bajo sus propias políticas de privacidad. <strong>No compartimos su información personal con el Registro Público</strong> — nuestras consultas se realizan con nuestras propias credenciales, no con las suyas. <strong>No vendemos su información personal a terceros.</strong>',
      ] },
      en: { h: 'Who We Share Information With', p: [
        'We share limited information with: <strong>Stripe</strong> (payment processing) and <strong>Postmark</strong> (email delivery), each under its own privacy policy. <strong>We do not share your personal information with the Public Registry</strong> — our searches are performed with our own credentials, not yours. <strong>We do not sell your personal information to third parties.</strong>',
      ] },
    },
    {
      es: { h: 'Uso de Datos Agregados con Fines de Mercadeo', p: [
        'Atlas Panama y sus empresas afiliadas podrán utilizar <strong>patrones de datos agregados y no identificables</strong> (es decir, sin vincularlos a un suscriptor específico) para mejorar la efectividad de campañas publicitarias generales en plataformas como Facebook, Instagram o Google Ads. <strong>No utilizaremos su información personal identificable para dirigirle publicidad individualizada basada en el estado específico de su propiedad o entidad.</strong>',
      ] },
      en: { h: 'Use of Aggregated Data for Marketing Purposes', p: [
        'Atlas Panama and its affiliated companies may use <strong>aggregated, non-identifiable data patterns</strong> (that is, not linked to any specific subscriber) to improve the effectiveness of general advertising campaigns on platforms such as Facebook, Instagram, or Google Ads. <strong>We will not use your personally identifiable information to target you with individualized advertising based on the specific status of your property or entity.</strong>',
      ] },
    },
    {
      es: { h: 'Retención de Datos', p: [
        'Conservamos su información mientras su suscripción esté activa. Una vez vencida, si usted no desea renovarla, transcurridos dos (2) meses su información será eliminada de nuestros archivos.',
      ] },
      en: { h: 'Data Retention', p: [
        'We retain your information while your subscription is active. Once it has expired, if you do not wish to renew it, your information will be deleted from our files after two (2) months.',
      ] },
    },
    {
      es: { h: 'Sus Derechos', p: [
        'Conforme a la Ley 81 de 2019 de Panamá sobre Protección de Datos Personales, usted tiene derecho a acceder a su información personal, a que sea rectificada, a cancelarla o eliminarla, y a oponerse a su tratamiento. Para ejercer estos derechos, escríbanos a <a href="mailto:operations@atlaspanama.com">operations@atlaspanama.com</a> y procederemos conforme a su petición.',
      ] },
      en: { h: 'Your Rights', p: [
        'Under Panama\'s Law 81 of 2019 on Personal Data Protection, you have the right to access your personal information, to have it rectified, to cancel or delete it, and to object to its processing. To exercise these rights, write to us at <a href="mailto:operations@atlaspanama.com">operations@atlaspanama.com</a> and we will proceed in accordance with your request.',
      ] },
    },
    {
      es: { h: 'Seguridad', p: [
        'Implementamos medidas razonables para proteger su información, aunque ningún sistema es completamente seguro.',
      ] },
      en: { h: 'Security', p: [
        'We implement reasonable measures to protect your information, although no system is completely secure.',
      ] },
    },
    {
      es: { h: 'Cambios a esta Política', p: [
        'Podremos actualizar esta política de tiempo en tiempo; le notificaremos sobre cambios significativos.',
      ] },
      en: { h: 'Changes to this Policy', p: [
        'We may update this policy from time to time; we will notify you of significant changes.',
      ] },
    },
    {
      es: { h: 'Contacto', p: [CONTACT.es + '.'] },
      en: { h: 'Contact', p: [CONTACT.en + '.'] },
    },
    {
      es: { h: 'Aceptación', p: [
        'Al suscribirse a nuestra plataforma, usted acepta nuestros <a href="/terminos">Términos y Condiciones</a>, así como nuestra Política de Privacidad en el servicio. Para consultas sobre esta Política, escríbanos a <a href="mailto:operations@atlaspanama.com">operations@atlaspanama.com</a>.',
      ] },
      en: { h: 'Acceptance', p: [
        'By subscribing to our platform, you accept our <a href="/terms">Terms of Service</a>, as well as our Privacy Policy for the service. For questions about this Policy, write to us at <a href="mailto:operations@atlaspanama.com">operations@atlaspanama.com</a>.',
      ] },
    },
  ],
};

const PREVAILS_NOTICE = {
  en: 'This English version is a translation provided for convenience only. The Spanish text is the governing version; in the event of any discrepancy or difference in interpretation, the Spanish version shall prevail.',
  es: 'La versión en inglés es una traducción proporcionada únicamente para conveniencia. El texto en español es la versión que rige; en caso de cualquier discrepancia o diferencia de interpretación, prevalecerá la versión en español.',
};

const CSS = `
    * { box-sizing: border-box; }
    html { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); background-attachment: fixed; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      margin: 0; padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      background-attachment: fixed;
      min-height: 100vh; min-height: 100dvh;
      display: flex;
      padding-top: max(20px, env(safe-area-inset-top));
      padding-bottom: max(20px, env(safe-area-inset-bottom));
    }
    .container {
      background: white; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 760px; width: 100%; margin: 0 auto; padding: 40px;
    }
    @media (max-width: 600px) { .container { padding: 24px 18px; } }
    .nav-row { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
    .nav-row a { color: #667eea; text-decoration: none; font-weight: 600; font-size: 14px; }
    .nav-row a:hover { text-decoration: underline; }
    h1 { margin: 0 0 8px 0; color: #333; font-size: 28px; font-weight: 700; }
    h1 .h1-es { display: block; font-size: 20px; color: #666; font-weight: 600; margin-top: 4px; }
    .dates { color: #666; font-size: 14px; margin-bottom: 24px; line-height: 1.6; }
    .notice { background: #f3f4fb; border-left: 4px solid #667eea; border-radius: 6px; padding: 14px 16px; margin-bottom: 28px; font-size: 14px; line-height: 1.6; color: #444; }
    .notice p { margin: 0 0 8px 0; font-size: 14px; }
    .notice p:last-child { margin-bottom: 0; }
    h2 { font-size: 18px; font-weight: 600; color: #333; margin: 32px 0 12px 0; padding-bottom: 6px; border-bottom: 2px solid #e0e0e0; }
    .es-block { border-left: 3px solid #d6d9f0; padding-left: 14px; margin-top: 14px; }
    .es-block h3 { font-size: 16px; font-weight: 600; color: #555; margin: 0 0 8px 0; }
    .lang-tag { display: inline-block; font-size: 11px; font-weight: 700; color: #667eea; letter-spacing: 0.5px; margin-bottom: 4px; }
    p { color: #555; line-height: 1.7; font-size: 15px; }
    strong { color: #333; }
    a { color: #667eea; }
`;

function page({ lang, title, body }) {
  return `<!doctype html>
<!-- GENERATED by scripts/build-legal-pages.js — do not edit by hand; edit the script and rerun it. -->
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${title} - Atlas Panama</title>
  <style>${CSS}  </style>
</head>
<body data-footer-lang="${lang}">
  <div class="container">
${body}
  </div>
  <script src="/site-footer.js"></script>
</body>
</html>
`;
}

const paras = (ps, indent) => ps.map(p => `${indent}<p>${p}</p>`).join('\n');

function buildSpanish(doc) {
  const body = [
    `    <div class="nav-row"><a href="/">&larr; Atlas Panama</a><a href="/${doc.slugEn}" lang="en">English version (bilingual) / Versión bilingüe &rarr;</a></div>`,
    `    <h1>${doc.title.es}</h1>`,
    `    <p class="dates">Fecha de entrada en vigor: ${EFFECTIVE.es}<br>Última actualización: ${UPDATED.es}</p>`,
    doc.intro ? `    <p>${doc.intro.es}</p>` : '',
    ...doc.clauses.map((c, i) => `    <h2>${i + 1}. ${c.es.h}</h2>\n${paras(c.es.p, '    ')}`),
  ].filter(Boolean).join('\n\n');
  return page({ lang: 'es', title: doc.title.es, body });
}

function buildBilingual(doc) {
  const esBlock = (h, ps) => `      <div class="es-block" lang="es">\n        <span class="lang-tag">ESPAÑOL</span>\n${h ? `        <h3>${h}</h3>\n` : ''}${paras(ps, '        ')}\n      </div>`;
  const body = [
    `    <div class="nav-row"><a href="/">&larr; Atlas Panama</a><a href="/${doc.slugEs}" lang="es">Read in Spanish only / Leer solo en español &rarr;</a></div>`,
    `    <h1>${doc.title.en}<span class="h1-es" lang="es">${doc.title.es}</span></h1>`,
    `    <p class="dates">Effective date: ${EFFECTIVE.en} · Fecha de entrada en vigor: ${EFFECTIVE.es}<br>Last updated: ${UPDATED.en} · Última actualización: ${UPDATED.es}</p>`,
    `    <div class="notice">\n      <p>${PREVAILS_NOTICE.en}</p>\n      <p lang="es">${PREVAILS_NOTICE.es}</p>\n    </div>`,
    doc.intro ? `    <section>\n      <p>${doc.intro.en}</p>\n${esBlock(null, [doc.intro.es])}\n    </section>` : '',
    ...doc.clauses.map((c, i) =>
      `    <section>\n      <h2>${i + 1}. ${c.en.h}</h2>\n${paras(c.en.p, '      ')}\n${esBlock(`${i + 1}. ${c.es.h}`, c.es.p)}\n    </section>`),
  ].filter(Boolean).join('\n\n');
  return page({ lang: 'en', title: `${doc.title.en} / ${doc.title.es}`, body });
}

function toMarkdown(html) {
  return html
    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
    .replace(/<a href="mailto:([^"]+)">[^<]*<\/a>/g, '$1')
    .replace(/<a href="(\/[^"]*)">(.*?)<\/a>/g, '[$2](https://atlaspanama.com$1)');
}

function buildMarkdown(doc) {
  const out = [
    `# ${doc.title.en} / ${doc.title.es}`,
    '',
    '*(Generado por scripts/build-legal-pages.js — es el mismo texto publicado en atlaspanama.com. Pendiente de revisión del abogado.)*',
    '',
    `Effective date: ${EFFECTIVE.en} · Fecha de entrada en vigor: ${EFFECTIVE.es}`,
    '',
    `> ${PREVAILS_NOTICE.en}`,
    '>',
    `> ${PREVAILS_NOTICE.es}`,
    '',
  ];
  if (doc.intro) out.push(toMarkdown(doc.intro.en), '', '*ES:* ' + toMarkdown(doc.intro.es), '');
  doc.clauses.forEach((c, i) => {
    out.push(`## ${i + 1}. ${c.en.h}`, '', ...c.en.p.flatMap(p => [toMarkdown(p), '']));
    out.push(`### ${i + 1}. ${c.es.h} (ES)`, '', ...c.es.p.flatMap(p => [toMarkdown(p), '']));
  });
  return out.join('\n');
}

for (const doc of [TERMS, PRIVACY]) {
  fs.writeFileSync(path.join(ROOT, 'public', `${doc.slugEs}.html`), buildSpanish(doc));
  fs.writeFileSync(path.join(ROOT, 'public', `${doc.slugEn}.html`), buildBilingual(doc));
  fs.writeFileSync(path.join(ROOT, 'legal', doc.md), buildMarkdown(doc));
  console.log(`Wrote public/${doc.slugEs}.html, public/${doc.slugEn}.html, legal/${doc.md}`);
}
