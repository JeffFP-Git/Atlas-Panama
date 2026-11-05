// Facebook Page cover (1640x624). Keep the lower-left clear of key text: Facebook puts the
// profile circle there on desktop. Usage: node make-cover.mjs <out.png>
import puppeteer from '/home/admin2/atlaspanama-jon/Daily Property Subscription Search/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import fs from 'fs';
const out = process.argv[2];
const bg = fs.readFileSync('/home/admin2/atlaspanama-jon/Daily Property Subscription Search/public/images/og-image.jpg').toString('base64');
const br = await puppeteer.launch({headless:'new',args:['--no-sandbox']}); const p = await br.newPage();
await p.setViewport({width:1640,height:624});
await p.setContent(`<!doctype html><html><body style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="width:1640px;height:624px;position:relative;overflow:hidden;background:url(data:image/jpeg;base64,${bg}) center/cover">
  <div style="position:absolute;inset:0;background:rgba(40,40,140,.62)"></div>
  <div style="position:absolute;top:58px;left:0;right:0;text-align:center;color:#fff">
    <div style="font-size:62px;font-weight:800;line-height:1.12">Sepa antes que nadie si algo cambia<br>en su propiedad o sociedad</div>
    <div style="font-size:30px;margin-top:22px">Revisamos el Registro Público de Panamá todos los días</div>
  </div>
  <div style="position:absolute;top:400px;left:0;right:0;text-align:center">
    <div style="display:inline-block;background:#fcd34d;color:#1f2a5a;border-radius:16px;padding:14px 34px;box-shadow:0 8px 24px rgba(0,0,0,.25)">
      <div style="font-size:36px;font-weight:800">6 meses gratis · sin tarjeta</div>
      <div style="font-size:21px;font-weight:700;margin-top:4px">Cortesía de PataroProperties.com · 6 months free, no card</div>
    </div>
  </div>
  <div style="position:absolute;bottom:40px;right:290px;color:#fff;font-size:40px;font-weight:700">atlaspanama.com</div>
</div></body></html>`, {waitUntil:'load'});
await p.screenshot({path:out}); await br.close();
