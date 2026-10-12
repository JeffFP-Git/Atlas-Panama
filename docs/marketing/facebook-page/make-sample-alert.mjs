import puppeteer from '/home/admin2/atlaspanama-jon/Daily Property Subscription Search/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
const out = process.argv[2];
const br = await puppeteer.launch({headless:'new',args:['--no-sandbox']}); const p = await br.newPage();
await p.setViewport({width:1080,height:1350});
await p.setContent(`<!doctype html><html><body style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="width:1080px;height:1350px;background:linear-gradient(135deg,#4c1d95,#7c3aed 60%,#a855f7);position:relative;overflow:hidden">
  <div style="position:absolute;top:60px;left:0;right:0;text-align:center;color:#fff">
    <div style="font-size:58px;font-weight:800;letter-spacing:-1px">Así se ve un aviso 🔔</div>
    <div style="font-size:34px;opacity:.85;margin-top:10px">This is what an alert looks like</div>
  </div>
  <div style="position:absolute;top:250px;left:90px;right:90px;background:#fff;border-radius:28px;box-shadow:0 30px 60px rgba(0,0,0,.35);overflow:hidden">
    <div style="background:#f3f4f6;padding:26px 36px;border-bottom:1px solid #e5e7eb;font-size:24px;color:#374151;line-height:1.5">
      <div><b>De:</b> Atlas Panama &lt;monitoring@atlaspanama.com&gt;</div>
      <div><b>Asunto:</b> 🔔 Atlas Panama: Cambio detectado — Finca 00000</div>
    </div>
    <div style="padding:36px 40px;color:#111827">
      <div style="font-size:40px;font-weight:800;margin-bottom:18px">Cambio detectado — Finca 00000</div>
      <div style="font-size:27px;margin-bottom:18px">Encontramos el siguiente cambio hoy:</div>
      <div style="font-size:28px;line-height:1.45;background:#fef9c3;border-left:8px solid #eab308;padding:18px 22px;border-radius:8px">
        <b>Prelación:</b> la entrada 000000/2026 (Hipoteca) ahora muestra el estado <b>"En Calificación"</b>.
      </div>
      <div style="font-size:25px;margin-top:20px;color:#374151">📎 El PDF adjunto muestra el registro completo, con la entrada nueva resaltada.</div>
      <div style="margin-top:24px;padding:16px 20px;border:3px solid #e74c3c;background:#fdecea;font-size:22px;color:#922;border-radius:8px;line-height:1.4">
        <b>Importante:</b> Si usted no autorizó o no reconoce este cambio, contacte a su abogado o contador de inmediato.
      </div>
    </div>
  </div>
  <div style="position:absolute;top:955px;left:50%;transform:translateX(-50%) rotate(-5deg);border:7px solid #dc2626;color:#dc2626;background:rgba(255,255,255,.92);font-size:44px;font-weight:900;padding:8px 26px;border-radius:12px;letter-spacing:2px;white-space:nowrap">EJEMPLO / EXAMPLE</div>
  <div style="position:absolute;bottom:60px;left:0;right:0;text-align:center;color:#fff">
    <div style="font-size:40px;font-weight:700">atlaspanama.com</div>
    <div style="display:inline-block;margin-top:16px;background:#facc15;color:#1f2937;font-size:32px;font-weight:800;padding:14px 34px;border-radius:999px">30 días gratis · sin tarjeta</div>
  </div>
</div></body></html>`, {waitUntil:'load'});
await p.screenshot({path:out}); await br.close();
