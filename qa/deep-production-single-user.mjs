import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const SITE=process.env.SITE_URL||'https://hxcor.github.io/CATALOGO-HX/';
const API=process.env.API_BASE||'https://catalogo-hx-backend.armando-avila.workers.dev';
const TOKEN=process.env.AIRTABLE_TOKEN||'';
const BASE=process.env.AIRTABLE_BASE_ID||'';
const USERS=process.env.USERS_TABLE_ID||'tbleeFejdXclP3md1';
const QUOTES=process.env.QUOTES_TABLE_ID||'tblqEJCKK7Ers6GWi';
const USER='qa-hx-test';
const RESULT=process.env.RESULT_FILE||'deep-production-single-user-result.txt';
const lines=[`CHECKED_AT_UTC=${new Date().toISOString().replace('.000','')}`];
const quoteIds=[];let testId='',browser=null,failed=0;
const write=()=>fs.writeFileSync(RESULT,lines.join('\n')+'\n');
const pass=(n,d='')=>{lines.push(`${n}=PASS${d?':'+d:''}`);write();};
const fail=(n,d='')=>{failed++;lines.push(`${n}=FAIL${d?':'+d:''}`);write();};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function req(url,opts={}){const r=await fetch(url,opts);const text=await r.text();let json=null;try{json=text?JSON.parse(text):null}catch{}return {status:r.status,ok:r.ok,text,json,headers:r.headers};}
async function at(table,path='',opts={}){return req(`https://api.airtable.com/v0/${BASE}/${table}${path}`,{...opts,headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json',...(opts.headers||{})}});}
function auth(token,extra={}){return {...extra,Authorization:`Bearer ${token}`};}
function qaPassword(){const digest=crypto.createHmac('sha256',TOKEN).update('CATALOGO-HX-single-test-user-v1').digest('hex');return `Q!${digest.slice(0,18)}a9`;}
async function loginApi(){return req(`${API}/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:USER,password:qaPassword()})});}
async function setRole(role){const r=await at(USERS,`/${testId}`,{method:'PATCH',body:JSON.stringify({fields:{Rol:role}})});if(!r.ok)throw new Error(`role_${role}_http_${r.status}`);await sleep(400);}
async function waitForLiveRelease(){
 const local=fs.readFileSync('index.html','utf8');
 const expected=[...local.matchAll(/(?:app\.html|security-post\.js)\?v=[^"'\s<]+/g)].map(m=>m[0]);
 if(expected.length<2)throw new Error('local_release_markers_missing');
 const deadline=Date.now()+180000;
 while(Date.now()<deadline){
  const live=await req(`${SITE}?release-wait=${Date.now()}`,{headers:{'Cache-Control':'no-cache'}});
  if(live.status===200&&expected.every(marker=>live.text.includes(marker))){pass('LIVE_RELEASE_VERSION',expected.join(','));return;}
  await sleep(5000);
 }
 throw new Error(`live_release_timeout_${expected.join('_')}`);
}
async function browserLogin(page){await page.goto(`${SITE}?deep=${Date.now()}-${Math.random()}`,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('#loginUser').waitFor({state:'visible',timeout:30000});await page.locator('#loginUser').fill(USER);await page.locator('#loginPass').fill(qaPassword());await page.locator('#btnLogin').click();await page.waitForFunction(()=>document.body.classList.contains('logged-in'),null,{timeout:30000});await page.locator('#searchInput').waitFor({state:'visible',timeout:30000});}
async function clickVisible(page,sel){const l=page.locator(sel);await l.waitFor({state:'visible',timeout:20000});await l.scrollIntoViewIfNeeded();await l.click({timeout:20000});}
async function testCatalogOrderUi(page,label){
 await page.waitForFunction(()=>document.querySelectorAll('#cardsGrid .pcard').length>1,null,{timeout:30000});
 const state=await page.evaluate(()=>{
  const collator=new Intl.Collator('es-MX',{sensitivity:'base',numeric:true,ignorePunctuation:true});
  const isSorted=values=>values.every((value,index)=>index===0||collator.compare(values[index-1],value)<=0);
  const companies=[...document.querySelectorAll('#cardsGrid .pcard .pcard-name')].map(el=>(el.textContent||'').trim()).filter(Boolean);
  const categories=[...document.querySelectorAll('#sidebarCats .side-btn .side-text')].map(el=>(el.textContent||'').trim()).filter(Boolean);
  const counts=[...document.querySelectorAll('#sidebarCats .side-count')].map(el=>{const rect=el.getBoundingClientRect();const style=getComputedStyle(el);return {right:rect.right,width:rect.width,numeric:style.fontVariantNumeric};});
  const aligned=counts.length>1&&counts.every(item=>Math.abs(item.right-counts[0].right)<=1&&Math.abs(item.width-counts[0].width)<=1&&String(item.numeric).includes('tabular'));
  return {companies,categories,companiesSorted:isSorted(companies),categoriesSorted:isSorted(categories),countsAligned:aligned,counts};
 });
 if(!state.companiesSorted)throw new Error(`${label}_companies_not_alphabetical`);
 pass(`${label}_COMPANIES_ALPHABETICAL`,`count_${state.companies.length}`);
 if(!state.categoriesSorted)throw new Error(`${label}_categories_not_alphabetical`);
 pass(`${label}_CATEGORIES_ALPHABETICAL`,`count_${state.categories.length}`);
 if(!state.countsAligned)throw new Error(`${label}_company_counts_not_aligned_${JSON.stringify(state.counts)}`);
 pass(`${label}_COMPANY_COUNTS_ALIGNED`,`count_${state.categories.length}`);
}
async function testModulesUi(page,label){
 await clickVisible(page,'#hxDivisasBtn');await page.locator('#hxDivisasView').waitFor({state:'visible',timeout:20000});await page.waitForFunction(()=>{const t=document.querySelector('#hxfxAverage')?.textContent||'';return t&&t!=='—';},null,{timeout:30000});const fx=await page.locator('#hxfxCalcResult').innerText();if(!fx||fx==='—')throw new Error(`${label}_divisas_empty`);pass(`${label}_UI_DIVISAS`);
 await clickVisible(page,'#hxLaboralBtn');await page.locator('#hxLaboralView').waitFor({state:'visible',timeout:20000});await page.locator('#hxlabImssPanel').waitFor({state:'visible',timeout:20000});await page.locator('#hxliMonthly').fill('30000');await page.locator('#hxliServiceYear').fill('1');await page.locator('#hxliVacationDays').fill('12');await page.locator('#hxliCalculate').click();
 await page.waitForFunction(()=>document.querySelectorAll('#hxliResult .hxli-summary-card').length>=6,null,{timeout:30000});
 const txt=await page.locator('#hxliResult').innerText();const normalized=txt.toLocaleLowerCase('es-MX');for(const m of ['SBC diario','INFONAVIT','Costo anual estimado','NO ES DETERMINACIÓN OFICIAL'])if(!normalized.includes(m.toLocaleLowerCase('es-MX')))throw new Error(`${label}_imss_missing_${m}`);const sbcVisible=await page.locator('#hxliResult .hxli-summary-card').filter({hasText:'SBC diario'}).isVisible().catch(()=>false);if(!sbcVisible)throw new Error(`${label}_sbc_not_visible`);pass(`${label}_UI_IMSS`);
}
try{
 write();if(!TOKEN||!BASE)throw new Error('missing_secrets');pass('SECRETS_CONFIGURED');const site=await req(`${SITE}?deep-boot=${Date.now()}`);site.status===200?pass('SITE_ONLINE'):fail('SITE_ONLINE',`http_${site.status}`);await waitForLiveRelease();const root=await req(`${API}/`);root.status===200?pass('API_ONLINE'):fail('API_ONLINE',`http_${root.status}`);
 for(const asset of ['divisas-hx-pro.js','divisas-hx-pro-fix.js','laboral-hx.js','laboral-imss.js','laboral-access.js','laboral-permissions-fix.js','laboral-navigation-fix.js']){const r=await req(`${SITE}${asset}?deep=${Date.now()}`);r.status===200?pass(`ASSET_${asset.replace(/[^A-Za-z0-9]/g,'_').toUpperCase()}`):fail(`ASSET_${asset}`,`http_${r.status}`);}
 const ul=await at(USERS,'?pageSize=100');if(!ul.ok)throw new Error(`users_http_${ul.status}`);const all=ul.json?.records||[];const tests=all.filter(r=>String(r.fields?.['Usuario (login)']||r.fields?.Usuario||'').toLowerCase()===USER);if(tests.length!==1)throw new Error(`qa_user_count_${tests.length}`);testId=tests[0].id;pass('SINGLE_QA_USER_PRESENT');String(tests[0].fields?.Contraseña||'').trim()?fail('QA_PASSWORD_HASH_ONLY','plaintext_present'):pass('QA_PASSWORD_HASH_ONLY');
 await setRole('viewer');pass('QA_ROLE_VIEWER_SET');let l=await loginApi();const viewerToken=l.json?.token;if(viewerToken&&l.json?.usuario?.rol==='viewer')pass('VIEWER_LOGIN_API');else throw new Error(`viewer_login_http_${l.status}`);const vu=await req(`${API}/usuarios`,{headers:auth(viewerToken)});vu.status===403?pass('VIEWER_USERS_BLOCKED'):fail('VIEWER_USERS_BLOCKED',`http_${vu.status}`);const vp=await req(`${API}/proveedores`,{headers:auth(viewerToken)});vp.status===200&&vp.json?.ok&&vp.json?.records?.length===1?pass('VIEWER_PROVIDER_SCOPE'):fail('VIEWER_PROVIDER_SCOPE',`count_${vp.json?.records?.length??'na'}`);const vr=await req(`${API}/divisas/current`,{headers:auth(viewerToken)});vr.status===200&&vr.json?.ok&&Number(vr.json?.data?.average)>0?pass('VIEWER_DIVISAS_RATE'):fail('VIEWER_DIVISAS_RATE',`http_${vr.status}`);
 const vq=await req(`${API}/divisas/quotes`,{method:'POST',headers:auth(viewerToken,{'Content-Type':'application/json'}),body:JSON.stringify({amount:321.45,origin:'USD',destination:'MXN',rateType:'sell',provider:'HX-QA',clientProject:'Deep QA Viewer'})});const vqid=vq.json?.record?.id;if(vqid)quoteIds.push(vqid);[200,201].includes(vq.status)&&vqid&&Number(vq.json?.record?.fields?.ResultadoConvertido)>0?pass('VIEWER_DIVISAS_QUOTE_CREATE'):fail('VIEWER_DIVISAS_QUOTE_CREATE',`http_${vq.status}`);
 const vi=await req(`${API}/laboral/imss-cost`,{method:'POST',headers:auth(viewerToken,{'Content-Type':'application/json'}),body:JSON.stringify({monthlySalary:30000,region:'general',serviceYear:1,vacationDays:12,aguinaldoDays:15,vacationPremiumPct:25,daysCotized:30.4,riskClass:'I'})});vi.status===200&&vi.json?.ok&&Number(vi.json?.result?.calculations?.employerCostMonthly)>0?pass('VIEWER_IMSS_API'):fail('VIEWER_IMSS_API',`http_${vi.status}`);const bad=await req(`${API}/laboral/imss-cost`,{method:'POST',headers:auth(viewerToken,{'Content-Type':'application/json'}),body:JSON.stringify({monthlySalary:30000,riskClass:'VI'})});[400,422].includes(bad.status)?pass('VIEWER_IMSS_VALIDATION_GUARD'):fail('VIEWER_IMSS_VALIDATION_GUARD',`http_${bad.status}`);
 browser=await chromium.launch({headless:true});pass('BROWSER_LAUNCH');
 for(const [name,viewport] of [['VIEWER_DESKTOP',{width:1440,height:1000}],['VIEWER_MOBILE',{width:390,height:844}]]){
  const c=await browser.newContext({viewport});const p=await c.newPage();
  try{
   await browserLogin(p);await p.waitForFunction(()=>document.body.classList.contains('is-viewer'),null,{timeout:20000});
   (await p.locator('#adminSideSection').isVisible().catch(()=>false))?fail(`${name}_ADMIN_HIDDEN`):pass(`${name}_ADMIN_HIDDEN`);
   await testModulesUi(p,name);
   if(viewport.width<600){const ov=await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);ov<=8?pass('VIEWER_MOBILE_NO_OVERFLOW',`px_${ov}`):fail('VIEWER_MOBILE_NO_OVERFLOW',`px_${ov}`);}
  }catch(e){fail(`${name}_UI_INSPECTION`,String(e?.message||e).replace(/\s+/g,'_').slice(0,180));}
  finally{await c.close();}
 }
 await setRole('admin');pass('QA_ROLE_ADMIN_SET');l=await loginApi();const adminToken=l.json?.token;if(adminToken&&l.json?.usuario?.rol==='admin')pass('ADMIN_LOGIN_API');else throw new Error(`admin_login_http_${l.status}`);const au=await req(`${API}/usuarios`,{headers:auth(adminToken)});au.status===200&&au.json?.ok&&Array.isArray(au.json.records)?pass('ADMIN_USERS_API'):fail('ADMIN_USERS_API',`http_${au.status}`);const sensitive=JSON.stringify(au.json||{}).match(/Password Hash|Contraseña|TOTP Secret/gi)||[];sensitive.length===0?pass('ADMIN_USERS_API_SANITIZED'):fail('ADMIN_USERS_API_SANITIZED',`matches_${sensitive.length}`);const ar=await req(`${API}/divisas/current`,{headers:auth(adminToken)});ar.status===200&&ar.json?.ok?pass('ADMIN_DIVISAS_RATE'):fail('ADMIN_DIVISAS_RATE',`http_${ar.status}`);const ai=await req(`${API}/laboral/imss-cost`,{method:'POST',headers:auth(adminToken,{'Content-Type':'application/json'}),body:JSON.stringify({monthlySalary:30000,region:'general',serviceYear:1,vacationDays:12,aguinaldoDays:15,vacationPremiumPct:25,daysCotized:30.4,riskClass:'V'})});ai.status===200&&ai.json?.ok&&ai.json?.result?.assumptions?.riskClass==='V'?pass('ADMIN_IMSS_API'):fail('ADMIN_IMSS_API',`http_${ai.status}`);const ac=await browser.newContext({viewport:{width:1440,height:1000}});const ap=await ac.newPage();
 try{await browserLogin(ap);await ap.waitForFunction(()=>document.body.classList.contains('is-admin'),null,{timeout:20000});await ap.locator('#adminAddBtn').waitFor({state:'visible',timeout:15000});pass('ADMIN_UI_CONTROLS');await testCatalogOrderUi(ap,'ADMIN');await testModulesUi(ap,'ADMIN');}
 catch(e){fail('ADMIN_UI_INSPECTION',String(e?.message||e).replace(/\s+/g,'_').slice(0,180));}
 finally{await ac.close();}
}catch(e){fail('UNHANDLED',String(e?.message||e).replace(/\s+/g,'_').slice(0,300));}
finally{try{if(testId)await setRole('viewer');if(testId)pass('FINAL_QA_ROLE_VIEWER');}catch(e){fail('FINAL_QA_ROLE_VIEWER',String(e?.message||e));}try{for(const id of quoteIds){const d=await at(QUOTES,`/${id}`,{method:'DELETE'});if(!d.ok)throw new Error(`quote_cleanup_${id}_${d.status}`);}pass('TEST_QUOTES_CLEANUP',`count_${quoteIds.length}`);}catch(e){fail('TEST_QUOTES_CLEANUP',String(e?.message||e));}try{if(browser)await browser.close();}catch{}try{const ul=await at(USERS,'?pageSize=100');const all=ul.json?.records||[];const q=all.filter(r=>String(r.fields?.['Usuario (login)']||r.fields?.Usuario||'').toLowerCase()===USER);const others=all.filter(r=>/^(cert-v3-|release-|qa-(?!hx-test)|e2e-|test-)/i.test(String(r.fields?.['Usuario (login)']||r.fields?.Usuario||''))).length;q.length===1&&others===0?pass('ONLY_ONE_TEST_USER_FINAL'):fail('ONLY_ONE_TEST_USER_FINAL',`qa_${q.length}_other_${others}`);}catch(e){fail('ONLY_ONE_TEST_USER_FINAL',String(e?.message||e));}lines.push(failed===0?'OVERALL=PASS':`OVERALL=FAIL:failures_${failed}`);write();if(failed)process.exitCode=1;}
