import { chromium } from 'playwright';
import fs from 'node:fs';

const SITE = process.env.SITE_URL || 'https://hxcor.github.io/CATALOGO-HX/';
const API = process.env.API_BASE || 'https://catalogo-hx-backend.armando-avila.workers.dev';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const USERS = process.env.USERS_TABLE_ID || 'tbleeFejdXclP3md1';
const PROVIDERS = process.env.PROVIDERS_TABLE_ID || 'tblkWbENo3IUGAoB6';
const BANKS = process.env.BANKS_TABLE_ID || 'tblheU9qbfFJUYmDh';
const QUOTES = process.env.QUOTES_TABLE_ID || 'tblqEJCKK7Ers6GWi';
const RESULT = process.env.RESULT_FILE || 'release-readiness-v2-result.txt';

let fails = 0;
let warnings = 0;
const lines = [`CHECKED_AT_UTC=${new Date().toISOString().replace('.000','')}`];
const tempIds = [];
const quoteIds = [];

function pass(name, detail='') { lines.push(`${name}=PASS${detail ? ':' + detail : ''}`); }
function fail(name, detail='') { fails++; lines.push(`${name}=FAIL${detail ? ':' + detail : ''}`); }
function warn(name, detail='') { warnings++; lines.push(`${name}=WARNING${detail ? ':' + detail : ''}`); }
function write() { fs.writeFileSync(RESULT, lines.join('\n') + '\n'); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function request(url, opts={}) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status:r.status, ok:r.ok, headers:r.headers, text, json };
}
function auth(token, extra={}) { return { ...extra, Authorization:`Bearer ${token}` }; }
function atHeaders(extra={}) { return { ...extra, Authorization:`Bearer ${AIRTABLE_TOKEN}` }; }
function allKeys(obj, out=[]) {
  if (Array.isArray(obj)) for (const x of obj) allKeys(x,out);
  else if (obj && typeof obj === 'object') for (const [k,v] of Object.entries(obj)) { out.push(k); allKeys(v,out); }
  return out;
}
function clabeMetrics(records){
  let unlinked=0, missing=0, invalid=0, placeholder=0;
  const map=new Map();
  for(const r of records){
    const f=r.fields||{};
    const links=f.Proveedor||[];
    if(!Array.isArray(links)||links.length===0) unlinked++;
    const cl=String(f.CLABE||'').trim();
    if(!cl) missing++;
    else if(!/^\d{18}$/.test(cl)) invalid++;
    else {
      const arr=map.get(cl)||[];
      arr.push({empresa:String(f.Empresa||''), banco:String(f.Banco||'')});
      map.set(cl,arr);
    }
    if(['CTA','CUENTA','N/A','NA','-'].includes(String(f.Cuenta||'').trim().toUpperCase())) placeholder++;
  }
  let dupGroups=0, crossEntity=0;
  for(const arr of map.values()) if(arr.length>1){
    dupGroups++;
    if(new Set(arr.map(x=>x.empresa)).size>1) crossEntity++;
  }
  return {rows:records.length,unlinked,missing,invalid,placeholder,dupGroups,crossEntity};
}

async function cleanup(){
  if(!AIRTABLE_TOKEN || !BASE) return;
  try{
    for(const id of quoteIds) await request(`https://api.airtable.com/v0/${BASE}/${QUOTES}/${id}`,{method:'DELETE',headers:atHeaders()});
    for(const id of tempIds) await request(`https://api.airtable.com/v0/${BASE}/${USERS}/${id}`,{method:'DELETE',headers:atHeaders()});
  }catch{}
}

let adminUser, adminPass, viewerUser, viewerPass, adminToken, viewerToken;

try {
  if(!AIRTABLE_TOKEN || !BASE) throw new Error('Missing AIRTABLE_TOKEN/AIRTABLE_BASE_ID');
  pass('SECRETS_CONFIGURED');

  const site = await request(`${SITE}?release=${Date.now()}`);
  site.status===200 ? pass('SITE_ONLINE') : fail('SITE_ONLINE',`http_${site.status}`);
  /Catálogo/i.test(site.text) ? pass('SITE_BOOTSTRAP') : fail('SITE_BOOTSTRAP');
  let assetFail=0;
  for(const asset of ['security-pre.js','security-post.js','divisas-hx-pro.js','laboral-hx.js','laboral-despido.js','laboral-imss.js']){
    const a=await request(`${SITE}${asset}?release=${Date.now()}`); if(a.status!==200) assetFail++;
  }
  assetFail===0 ? pass('FRONTEND_ASSETS') : fail('FRONTEND_ASSETS',`missing_${assetFail}`);
  const root=await request(`${API}/`); root.status===200 ? pass('API_ONLINE') : fail('API_ONLINE',`http_${root.status}`);

  for(const [name,path,method,body] of [
    ['usuarios','usuarios','GET',null],['proveedores','proveedores','GET',null],['bancos','bancos','GET',null],
    ['laboral_parameters','laboral/parameters','GET',null],['laboral_imss','laboral/imss-cost','POST',{}],['divisas_current','divisas/current','GET',null]
  ]){
    const u=await request(`${API}/${path}`,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    [401,403].includes(u.status) ? pass(`UNAUTH_${name}`) : fail(`UNAUTH_${name}`,`http_${u.status}`);
  }
  const bad=await request(`${API}/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:'__release_invalid__',password:'__release_invalid__'})});
  bad.status===401 ? pass('INVALID_LOGIN_REJECTED') : fail('INVALID_LOGIN_REJECTED',`http_${bad.status}`);
  const cors=await request(`${API}/usuarios`,{method:'OPTIONS',headers:{Origin:'https://evil.example','Access-Control-Request-Method':'GET'}});
  cors.headers.get('access-control-allow-origin')!=='https://evil.example' ? pass('CORS_EVIL_ORIGIN_BLOCKED') : fail('CORS_EVIL_ORIGIN_BLOCKED');

  const suffix=`${Date.now()}-${Math.floor(Math.random()*1e6)}`;
  adminUser=`release-admin-${suffix}`; viewerUser=`release-viewer-${suffix}`;
  adminPass=`A${crypto.randomUUID()}z9!`; viewerPass=`V${crypto.randomUUID()}x8!`;
  const create=await request(`https://api.airtable.com/v0/${BASE}/${USERS}`,{
    method:'POST', headers:atHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify({records:[
      {fields:{'Nombre completo':'Release Temporary Admin','Usuario':adminUser,'Usuario (login)':adminUser,'Contraseña':adminPass,'Rol':'admin'}},
      {fields:{'Nombre completo':'Release Temporary Viewer','Usuario':viewerUser,'Usuario (login)':viewerUser,'Contraseña':viewerPass,'Rol':'viewer','Empresas permitidas':'GCO1110249CA'}}
    ]})
  });
  if([200,201].includes(create.status) && create.json?.records?.length===2){ tempIds.push(...create.json.records.map(r=>r.id)); pass('TEMP_USERS_CREATED'); }
  else fail('TEMP_USERS_CREATED',`http_${create.status}`);

  const al=await request(`${API}/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:adminUser,password:adminPass})});
  const vl=await request(`${API}/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:viewerUser,password:viewerPass})});
  adminToken=al.json?.token; viewerToken=vl.json?.token;
  adminToken ? pass('ADMIN_LOGIN') : fail('ADMIN_LOGIN',`http_${al.status}`);
  viewerToken ? pass('VIEWER_LOGIN') : fail('VIEWER_LOGIN',`http_${vl.status}`);

  const au=await request(`${API}/usuarios`,{headers:auth(adminToken)});
  au.status===200 && au.json?.ok && au.json.records?.length>=10 ? pass('ADMIN_USERS_LIST') : fail('ADMIN_USERS_LIST',`http_${au.status}`);
  const sensitive=allKeys(au.json).filter(k=>/password|contraseña|totp|hash/i.test(k));
  sensitive.length===0 ? pass('USERS_API_SANITIZED') : fail('USERS_API_SANITIZED',`keys_${sensitive.length}`);
  const vu=await request(`${API}/usuarios`,{headers:auth(viewerToken)});
  vu.status===403 ? pass('VIEWER_USERS_BLOCKED') : fail('VIEWER_USERS_BLOCKED',`http_${vu.status}`);

  const udb=await request(`https://api.airtable.com/v0/${BASE}/${USERS}?pageSize=100`,{headers:atHeaders()});
  const ur=udb.json?.records||[]; const logins=[]; let plain=0,badRole=0,obsolete=0;
  for(const r of ur){ const f=r.fields||{}; const login=String(f['Usuario (login)']||f.Usuario||'').trim().toLowerCase(); const temporary=/^(release|browser|lab|imss|final-browser|fullqa|qa-ui|cert-v3)-(admin|viewer)-/.test(login); if(login)logins.push(login); if(f['Contraseña']&&!temporary)plain++; if(!['admin','viewer'].includes(String(f.Rol||'').toLowerCase()))badRole++; if(String(f['Empresas permitidas']||'').includes('PRU010101AAA'))obsolete++; }
  plain===0 ? pass('USERS_NO_PLAINTEXT_PASSWORDS') : fail('USERS_NO_PLAINTEXT_PASSWORDS',`count_${plain}`);
  logins.length===new Set(logins).size ? pass('USERS_LOGIN_UNIQUENESS') : fail('USERS_LOGIN_UNIQUENESS');
  badRole===0 ? pass('USERS_ROLE_INTEGRITY') : fail('USERS_ROLE_INTEGRITY',`count_${badRole}`);
  obsolete===0 ? pass('USERS_NO_OBSOLETE_PERMISSION_RFC') : fail('USERS_NO_OBSOLETE_PERMISSION_RFC',`count_${obsolete}`);

  const ap=await request(`${API}/proveedores`,{headers:auth(adminToken)});
  const ab=await request(`${API}/bancos`,{headers:auth(adminToken)});
  ap.status===200 && ap.json?.ok && ap.json.records?.length===46 ? pass('PROVIDERS_ADMIN_46') : fail('PROVIDERS_ADMIN_46',`count_${ap.json?.records?.length??'na'}`);
  ab.status===200 && ab.json?.ok && ab.json.records?.length===58 ? pass('BANKS_ADMIN_58') : fail('BANKS_ADMIN_58',`count_${ab.json?.records?.length??'na'}`);
  const vp=await request(`${API}/proveedores`,{headers:auth(viewerToken)});
  const vb=await request(`${API}/bancos`,{headers:auth(viewerToken)});
  vp.status===200 && vp.json?.ok && vp.json.records?.length===1 && vp.json.records[0]?.fields?.RFC==='GCO1110249CA' ? pass('VIEWER_PROVIDER_SCOPE') : fail('VIEWER_PROVIDER_SCOPE');
  const viewerProviderId=vp.json?.records?.[0]?.id;
  const bankLinks=(vb.json?.records||[]).flatMap(r=>Array.isArray(r.fields?.Proveedor)?r.fields.Proveedor:[]).map(x=>typeof x==='string'?x:x?.id).filter(Boolean);
  vb.status===200 && vb.json?.ok && viewerProviderId && bankLinks.length>0 && bankLinks.every(x=>x===viewerProviderId) ? pass('VIEWER_BANK_SCOPE') : fail('VIEWER_BANK_SCOPE',`records_${vb.json?.records?.length??'na'}`);
  const vw=await request(`${API}/bancos`,{method:'POST',headers:auth(viewerToken,{'Content-Type':'application/json'}),body:JSON.stringify({fields:{Empresa:'RELEASE SHOULD NOT WRITE'}})});
  vw.status===403 ? pass('VIEWER_BANK_WRITE_BLOCKED') : fail('VIEWER_BANK_WRITE_BLOCKED',`http_${vw.status}`);

  const bdb=await request(`https://api.airtable.com/v0/${BASE}/${BANKS}?pageSize=100`,{headers:atHeaders()});
  const bm=clabeMetrics(bdb.json?.records||[]);
  bm.rows===58 ? pass('BANK_MASTER_COUNT_58') : fail('BANK_MASTER_COUNT_58',`count_${bm.rows}`);
  bm.unlinked===0 ? pass('BANK_PROVIDER_LINKS') : fail('BANK_PROVIDER_LINKS',`count_${bm.unlinked}`);
  bm.missing===0 ? pass('BANK_CLABE_COMPLETENESS') : warn('BANK_CLABE_COMPLETENESS',`missing_${bm.missing}`);
  bm.invalid===0 ? pass('BANK_CLABE_FORMAT') : warn('BANK_CLABE_FORMAT',`invalid_${bm.invalid}`);
  bm.placeholder===0 ? pass('BANK_ACCOUNT_COMPLETENESS') : warn('BANK_ACCOUNT_COMPLETENESS',`placeholder_${bm.placeholder}`);
  bm.dupGroups===0 ? pass('BANK_DUPLICATE_CLABE') : warn('BANK_DUPLICATE_CLABE',`groups_${bm.dupGroups}`);
  bm.crossEntity===0 ? pass('BANK_CROSS_ENTITY_CLABE') : warn('BANK_CROSS_ENTITY_CLABE',`groups_${bm.crossEntity}`);

  const rate=await request(`${API}/divisas/current`,{headers:auth(adminToken)});
  const rd=rate.json?.data;
  rate.status===200 && rate.json?.ok && Number(rd?.buy)>0 && Number(rd?.sell)>0 && Number(rd?.average)>0 ? pass('COTIZADOR_RATE_SOURCE') : fail('COTIZADOR_RATE_SOURCE',`http_${rate.status}`);
  const amount=1000;
  const q=await request(`${API}/divisas/quotes`,{method:'POST',headers:auth(adminToken,{'Content-Type':'application/json'}),body:JSON.stringify({amount,origin:'USD',destination:'MXN',rateType:'sell',provider:'HX',clientProject:'Release QA'})});
  const qid=q.json?.record?.id || null; if(qid) quoteIds.push(qid);
  [200,201].includes(q.status) && qid ? pass('COTIZADOR_CREATE') : fail('COTIZADOR_CREATE',`http_${q.status}`);
  const usedRate=Number(q.json?.record?.fields?.TipoCambioUsado); const converted=Number(q.json?.record?.fields?.ResultadoConvertido); const expected=Math.round(amount*usedRate*100)/100;
  Number.isFinite(usedRate) && Number.isFinite(converted) && Math.abs(converted-expected)<=0.01 ? pass('COTIZADOR_MATH') : fail('COTIZADOR_MATH',`rate_${usedRate}_result_${converted}`);
  if(qid){ const qdb=await request(`https://api.airtable.com/v0/${BASE}/${QUOTES}/${qid}`,{headers:atHeaders()}); qdb.status===200 && qdb.json?.id===qid ? pass('COTIZADOR_PERSISTENCE') : fail('COTIZADOR_PERSISTENCE'); }
  const badAmt=await request(`${API}/divisas/quotes`,{method:'POST',headers:auth(adminToken,{'Content-Type':'application/json'}),body:JSON.stringify({amount:0,origin:'USD',destination:'MXN',rateType:'sell'})});
  [400,422].includes(badAmt.status) ? pass('COTIZADOR_INVALID_AMOUNT_GUARD') : fail('COTIZADOR_INVALID_AMOUNT_GUARD',`http_${badAmt.status}`);
  const badPair=await request(`${API}/divisas/quotes`,{method:'POST',headers:auth(adminToken,{'Content-Type':'application/json'}),body:JSON.stringify({amount:1000,origin:'EUR',destination:'MXN',rateType:'sell'})});
  [400,422].includes(badPair.status) ? pass('COTIZADOR_PAIR_GUARD') : fail('COTIZADOR_PAIR_GUARD',`http_${badPair.status}`);

  const lp=await request(`${API}/laboral/parameters`,{headers:auth(adminToken)}); lp.status===200 && lp.json?.ok ? pass('LABORAL_PARAMETERS') : fail('LABORAL_PARAMETERS',`http_${lp.status}`);
  const lvp=await request(`${API}/laboral/parameters`,{headers:auth(viewerToken)}); lvp.status===200&&lvp.json?.ok ? pass('LABORAL_VIEWER_ACCESS') : fail('LABORAL_VIEWER_ACCESS',`http_${lvp.status}`);
  const lb=await request(`${API}/laboral/calculate`,{method:'POST',headers:auth(adminToken,{'Content-Type':'application/json'}),body:JSON.stringify({monthlySalary:30000,startDate:'2024-01-01',endDate:'2026-08-21',scenario:'renuncia',unpaidSalaryDays:5})});
  lb.status===200 && lb.json?.ok && Number(lb.json?.result?.calculations?.total)>0 ? pass('LABORAL_BASE_MATH') : fail('LABORAL_BASE_MATH',`http_${lb.status}`);
  const ld=await request(`${API}/laboral/dismissal`,{method:'POST',headers:auth(adminToken,{'Content-Type':'application/json'}),body:JSON.stringify({monthlySalary:30000,startDate:'2024-01-01',endDate:'2026-08-21',scenario:'despido_injustificado',relationType:'indeterminado',unpaidSalaryDays:0,art49Confirmed:false})});
  ld.status===200 && ld.json?.ok && Number(ld.json?.result?.calculations?.totalBaseEstimado)>0 && Number(ld.json?.result?.calculations?.indemnizacionConstitucional)>0 ? pass('LABORAL_DISMISSAL_REGRESSION') : fail('LABORAL_DISMISSAL_REGRESSION',`http_${ld.status}`);

  async function imss(name,body,predicate){ const r=await request(`${API}/laboral/imss-cost`,{method:'POST',headers:auth(adminToken,{'Content-Type':'application/json'}),body:JSON.stringify(body)}); if(r.status===200 && r.json?.ok && predicate(r.json.result,r.json)) pass(name); else fail(name,`http_${r.status}`); return r; }
  const baseBody={monthlySalary:30000,region:'general',serviceYear:1,vacationDays:12,aguinaldoDays:15,vacationPremiumPct:25,daysCotized:30.4,riskClass:'I'};
  await imss('IMSS_NORMAL_MATH',baseBody,r=>r?.salary?.sbcDaily===1049.32 && r?.calculations?.employerImssMonthly===5604.14 && r?.calculations?.workerQuotaWithheldMonthly===842.41 && r?.calculations?.infonavitMonthly===1594.96 && r?.calculations?.employerCostMonthly===37199.09);
  await imss('IMSS_MINIMUM_WAGE_ART36',{...baseBody,monthlySalary:9000},r=>Number(r?.salary?.sbcDaily)>0);
  await imss('IMSS_RISK_CLASS_I',baseBody,r=>r?.assumptions?.riskClass==='I');
  await imss('IMSS_RISK_CLASS_V',{...baseBody,riskClass:'V'},r=>r?.assumptions?.riskClass==='V');
  await imss('IMSS_CUSTOM_RISK_PREMIUM',{...baseBody,riskPremiumPct:2.5},r=>r?.assumptions?.riskPremiumPct===2.5 && r?.assumptions?.riskClass==='Personalizada');
  await imss('IMSS_25_UMA_CAP',{...baseBody,monthlySalary:1000000},r=>r?.salary?.capApplied===true && Number(r?.salary?.sbcDaily)===Number(r?.salary?.maxSbc));
  await imss('IMSS_SUPERIOR_BENEFITS',{...baseBody,vacationDays:30,aguinaldoDays:30,vacationPremiumPct:50},r=>Number(r?.salary?.integrationFactor)>1.0493);
  await imss('IMSS_KNOWN_SBC_OVERRIDE',{...baseBody,knownSbcDaily:1200},r=>r?.salary?.sbcDaily===1200 && /capturado/i.test(String(r?.salary?.sbcSource||'')));
  const badRisk=await request(`${API}/laboral/imss-cost`,{method:'POST',headers:auth(adminToken,{'Content-Type':'application/json'}),body:JSON.stringify({...baseBody,riskClass:'VI'})}); [400,422].includes(badRisk.status)?pass('IMSS_RISK_CLASS_GUARD'):fail('IMSS_RISK_CLASS_GUARD',`http_${badRisk.status}`);
  const badPremium=await request(`${API}/laboral/imss-cost`,{method:'POST',headers:auth(adminToken,{'Content-Type':'application/json'}),body:JSON.stringify({...baseBody,riskPremiumPct:150})}); [400,422].includes(badPremium.status)?pass('IMSS_RISK_RANGE_GUARD'):fail('IMSS_RISK_RANGE_GUARD',`http_${badPremium.status}`);
  const vimss=await request(`${API}/laboral/imss-cost`,{method:'POST',headers:auth(viewerToken,{'Content-Type':'application/json'}),body:JSON.stringify(baseBody)}); vimss.status===200&&vimss.json?.ok?pass('IMSS_VIEWER_ACCESS'):fail('IMSS_VIEWER_ACCESS',`http_${vimss.status}`);

  const browser=await chromium.launch({headless:true});
  try{
    async function login(page,user,pw){
      await page.goto(`${SITE}?release-ui=${Date.now()}-${Math.random()}`,{waitUntil:'domcontentloaded',timeout:60000});
      await page.locator('#loginUser').waitFor({state:'visible',timeout:30000});
      await page.locator('#loginUser').fill(user); await page.locator('#loginPass').fill(pw); await page.locator('#btnLogin').click();
      await page.waitForFunction(()=>document.body.classList.contains('logged-in'),null,{timeout:30000});
      await page.waitForFunction(()=>document.body.classList.contains('is-admin')||document.body.classList.contains('is-viewer'),null,{timeout:30000});
      await page.locator('#searchInput').waitFor({state:'visible',timeout:30000});
    }
    const actx=await browser.newContext({viewport:{width:1440,height:1100}}), p=await actx.newPage();
    await login(p,adminUser,adminPass); await p.locator('#adminAddBtn').waitFor({state:'visible',timeout:15000}); pass('UI_ADMIN_LOGIN_AND_CONTROLS');
    await p.locator('button[onclick="openAdminPanel()"]').click(); await p.locator('#adminOverlay').waitFor({state:'visible',timeout:10000}); await p.getByRole('button',{name:'Usuarios',exact:true}).click();
    await p.waitForFunction(()=>document.querySelectorAll('#usersList .user-row').length>=1,null,{timeout:20000}); const ut=await p.locator('#usersList').innerText(); if(/Password Hash|Contraseña|TOTP/i.test(ut)) throw new Error('usuarios UI sensible'); pass('UI_USERS_ADMIN');
    await p.locator('#adminOverlay button[onclick*="closeOverlay"]').first().click(); await p.locator('#adminOverlay').waitFor({state:'hidden',timeout:10000});
    const divBtn=p.locator('#hxDivisasBtn'); await divBtn.waitFor({state:'visible',timeout:20000}); await divBtn.scrollIntoViewIfNeeded(); await divBtn.click(); await p.locator('#hxfxCreateQuote').waitFor({state:'visible',timeout:20000});
    await p.waitForFunction(()=>{const t=document.querySelector('#hxfxAverage')?.textContent||'';return t&&t!=='—';},null,{timeout:25000}); const calc=await p.locator('#hxfxCalcResult').innerText(); if(!calc||calc==='—') throw new Error('cotizador UI vacío'); pass('UI_COTIZADOR');
    const labBtn=p.locator('#hxLaboralBtn'); await labBtn.waitFor({state:'visible',timeout:20000}); await labBtn.scrollIntoViewIfNeeded(); await labBtn.click(); await p.locator('#hxlabImssPanel').waitFor({state:'visible',timeout:20000});
    await p.locator('#hxliMonthly').fill('30000'); await p.locator('#hxliServiceYear').fill('1'); await p.locator('#hxliVacationDays').fill('12'); await p.locator('#hxliCalculate').click();
    await p.waitForFunction(()=>/Costo patronal mensual estimado/i.test(document.querySelector('#hxliResult')?.innerText||''),null,{timeout:25000}); const it=await p.locator('#hxliResult').innerText();
    for(const m of ['SBC diario','INFONAVIT','Costo anual estimado','Fundamento del cálculo','NO ES DETERMINACIÓN OFICIAL']) if(!it.toLocaleLowerCase().includes(m.toLocaleLowerCase())) throw new Error(`IMSS UI sin ${m}`); pass('UI_IMSS_COMPLETE'); await actx.close();
    for(const [label,viewport] of [['VIEWER_DESKTOP',{width:1440,height:1000}],['VIEWER_MOBILE',{width:390,height:844}]]){
      const c=await browser.newContext({viewport}),v=await c.newPage(); await login(v,viewerUser,viewerPass); await v.waitForFunction(()=>Number(document.querySelector('#statTotal')?.textContent||'-1')===1,null,{timeout:30000});
      const cards=await v.locator('#cardsGrid .pcard').count(); const tx=await v.locator('#cardsGrid').innerText(); if(cards!==1||!/GHR Constructor/i.test(tx)) throw new Error(`${label} scope`); if(await v.locator('#adminSideSection').isVisible().catch(()=>false)) throw new Error(`${label} admin visible`); if(!await v.locator('#hxDivisasBtn').isVisible().catch(()=>false)) throw new Error(`${label} divisas no visible`); const laboral=v.locator('#hxLaboralBtn'); if(!await laboral.isVisible().catch(()=>false)) throw new Error(`${label} laboral no visible`); await laboral.click(); await v.locator('#hxlabImssPanel').waitFor({state:'visible',timeout:20000}); if(viewport.width<600){const ov=await v.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth); if(ov>8) throw new Error(`${label} overflow ${ov}`);} pass(`${label}_PERMISSIONS_AND_LAYOUT`); await c.close();
    }
    pass('BROWSER_E2E');
  } catch(e) { fail('BROWSER_E2E',String(e.message||e).replace(/\s+/g,'_').slice(0,180)); }
  finally { await browser.close(); }

} catch(e) {
  fail('AUDIT_RUNTIME',String(e.message||e).replace(/\s+/g,'_').slice(0,200));
} finally {
  await cleanup();
  await sleep(1200);
  if(AIRTABLE_TOKEN && BASE){
    try{
      const f=await request(`https://api.airtable.com/v0/${BASE}/${USERS}?pageSize=100`,{headers:atHeaders()});
      const all=f.json?.records||[];
      const left=all.filter(r=>/^(release-admin-|release-viewer-)/.test(String(r.fields?.Usuario||''))).length;
      left===0 ? pass('TEMP_USERS_CLEANUP') : fail('TEMP_USERS_CLEANUP',`left_${left}`);
      const qf=await request(`https://api.airtable.com/v0/${BASE}/${QUOTES}?pageSize=100`,{headers:atHeaders()});
      const qleft=(qf.json?.records||[]).filter(r=>/^release-admin-/.test(String(r.fields?.Usuario||''))).length;
      qleft===0 ? pass('TEMP_QUOTES_CLEANUP') : fail('TEMP_QUOTES_CLEANUP',`left_${qleft}`);
    }catch(e){ fail('FINAL_CLEANUP_VERIFICATION','verification_error'); }
  }
  lines.push(`TOTAL_FAILURES=${fails}`);
  lines.push(`TOTAL_WARNINGS=${warnings}`);
  if(fails===0) lines.push(`RELEASE_VERDICT=${warnings>0?'PASS_WITH_MASTER_DATA_WARNINGS':'PASS'}`);
  else lines.push('RELEASE_VERDICT=FAIL');
  write();
}

if(fails>0) process.exit(1);
