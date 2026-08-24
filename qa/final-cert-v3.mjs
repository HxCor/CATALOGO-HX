import fs from 'node:fs';

const SITE=process.env.SITE_URL||'https://hxcor.github.io/CATALOGO-HX/';
const AIRTABLE_TOKEN=process.env.AIRTABLE_TOKEN||'';
const BASE=process.env.AIRTABLE_BASE_ID||'';
const USERS=process.env.USERS_TABLE_ID||'tbleeFejdXclP3md1';
const RESULT=process.env.RESULT_FILE||'final-certification-v3-result.txt';
const lines=[`CHECKED_AT_UTC=${new Date().toISOString().replace('.000','')}`];
const tempIds=[];
let browser=null;
let overallPass=false;
let baselineUserCount=null;
const append=s=>{lines.push(s);fs.writeFileSync(RESULT,lines.join('\n')+'\n');};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function req(url,opts={}){
  const r=await fetch(url,opts); const text=await r.text(); let json=null;
  try{json=text?JSON.parse(text):null;}catch{}
  return {status:r.status,ok:r.ok,text,json,headers:r.headers};
}
async function at(url,opts={}){return req(url,{...opts,headers:{...(opts.headers||{}),Authorization:`Bearer ${AIRTABLE_TOKEN}`}});}
async function login(page,u,p){
  await page.goto(`${SITE}?cert-v3=${Date.now()}-${Math.random()}`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#loginUser').waitFor({state:'visible',timeout:30000});
  await page.locator('#loginUser').fill(u); await page.locator('#loginPass').fill(p); await page.locator('#btnLogin').click();
  await page.waitForFunction(()=>document.body.classList.contains('logged-in'),null,{timeout:30000});
  await page.waitForFunction(()=>document.body.classList.contains('is-admin')||document.body.classList.contains('is-viewer'),null,{timeout:30000});
  await page.locator('#searchInput').waitFor({state:'visible',timeout:30000});
}
async function pointerClick(page,selector,label){
  const loc=page.locator(selector); await loc.waitFor({state:'visible',timeout:20000});
  await loc.evaluate(el=>el.scrollIntoView({block:'center',inline:'center'})); await page.waitForTimeout(300);
  const box=await loc.boundingBox(); if(!box) throw new Error(`${label}:no_bounding_box`);
  const x=box.x+box.width/2,y=box.y+box.height/2;
  const hit=await page.evaluate(({x,y,selector})=>{const target=document.querySelector(selector),at=document.elementFromPoint(x,y);return {same:!!target&&!!at&&(at===target||target.contains(at)),hitTag:at?.tagName||'',hitId:at?.id||'',hitClass:String(at?.className||''),display:target?getComputedStyle(target).display:'',visibility:target?getComputedStyle(target).visibility:'',pointerEvents:target?getComputedStyle(target).pointerEvents:''};},{x,y,selector});
  append(`${label}_HIT=${hit.same?'PASS':'FAIL'}:${JSON.stringify(hit).replace(/\s+/g,'_')}`);
  if(!hit.same) throw new Error(`${label}:blocked_by_${hit.hitTag}_${hit.hitId}_${hit.hitClass}`);
  await page.mouse.click(x,y);
}

try{
  fs.writeFileSync(RESULT,lines.join('\n')+'\n');
  if(!AIRTABLE_TOKEN||!BASE) throw new Error('missing_airtable_secrets');
  append('SECRETS_CONFIGURED=PASS');
  append('BROWSER_RUNTIME_START=PASS');
  const {chromium}=await import('playwright'); append('PLAYWRIGHT_MODULE=PASS');
  browser=await chromium.launch({headless:true}); append('CHROMIUM_LAUNCH=PASS');

  const baseline=await at(`https://api.airtable.com/v0/${BASE}/${USERS}?pageSize=100`);
  if(!baseline.ok) throw new Error(`baseline_users_http_${baseline.status}`);
  baselineUserCount=(baseline.json?.records||[]).length;
  append(`BASELINE_USERS=${baselineUserCount}`);

  const suffix=`${Date.now()}-${Math.floor(Math.random()*1e6)}`;
  const au=`cert-v3-admin-${suffix}`,ap=`A${crypto.randomUUID()}z9!`,vu=`cert-v3-viewer-${suffix}`,vp=`V${crypto.randomUUID()}x8!`;
  const cr=await at(`https://api.airtable.com/v0/${BASE}/${USERS}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records:[
    {fields:{'Nombre completo':'Certification V3 Temporary Admin','Usuario':au,'Usuario (login)':au,'Contraseña':ap,'Rol':'admin'}},
    {fields:{'Nombre completo':'Certification V3 Temporary Viewer','Usuario':vu,'Usuario (login)':vu,'Contraseña':vp,'Rol':'viewer','Empresas permitidas':'GCO1110249CA'}}
  ]})});
  if(![200,201].includes(cr.status)||cr.json?.records?.length!==2) throw new Error(`temp_users_http_${cr.status}`);
  tempIds.push(...cr.json.records.map(r=>r.id)); append('TEMP_USERS_CREATED=PASS'); await sleep(1000);

  const ctx=await browser.newContext({viewport:{width:1440,height:1100}}),p=await ctx.newPage();
  await login(p,au,ap); append('ADMIN_LOGIN_UI=PASS');
  await p.locator('button[onclick="openAdminPanel()"]').click(); await p.locator('#adminOverlay').waitFor({state:'visible',timeout:10000});
  await p.getByRole('button',{name:'Usuarios',exact:true}).click();
  await p.waitForFunction(expected=>document.querySelectorAll('#usersList .user-row').length>=expected,baselineUserCount+2,{timeout:20000});
  const usersText=await p.locator('#usersList').innerText(); if(/Password Hash|Contraseña|TOTP/i.test(usersText)) throw new Error('sensitive_user_fields_visible'); append('ADMIN_USERS_UI=PASS');
  await p.locator('#adminOverlay button[onclick*="closeOverlay"]').first().click(); await p.locator('#adminOverlay').waitFor({state:'hidden',timeout:10000}); append('ADMIN_OVERLAY_CLOSE=PASS');

  await pointerClick(p,'#hxDivisasBtn','DIVISAS_POINTER');
  await p.locator('#hxDivisasView').waitFor({state:'visible',timeout:20000}); await p.locator('#hxfxCreateQuote').waitFor({state:'visible',timeout:20000});
  await p.waitForFunction(()=>{const t=document.querySelector('#hxfxAverage')?.textContent||'';return t&&t!=='—';},null,{timeout:30000});
  const fx=await p.locator('#hxfxCalcResult').innerText(); if(!fx||fx==='—') throw new Error('divisas_result_empty'); append('DIVISAS_NAVIGATION_AND_CALCULATOR_UI=PASS');

  await pointerClick(p,'#hxLaboralBtn','LABORAL_POINTER');
  await p.locator('#hxLaboralView').waitFor({state:'visible',timeout:20000}); await p.locator('#hxlabImssPanel').waitFor({state:'visible',timeout:20000});
  await p.locator('#hxliMonthly').fill('30000'); await p.locator('#hxliServiceYear').fill('1'); await p.locator('#hxliVacationDays').fill('12'); await p.locator('#hxliCalculate').click();
  await p.waitForFunction(()=>/Costo patronal mensual estimado/i.test(document.querySelector('#hxliResult')?.innerText||''),null,{timeout:30000});
  const im=await p.locator('#hxliResult').innerText(); for(const m of ['SBC diario','INFONAVIT','Costo anual estimado','Fundamento del cálculo','NO ES DETERMINACIÓN OFICIAL']) if(!im.includes(m)) throw new Error(`imss_missing_${m}`);
  append('LABORAL_IMSS_NAVIGATION_AND_UI=PASS'); await ctx.close();

  for(const [label,viewport] of [['VIEWER_DESKTOP',{width:1440,height:1000}],['VIEWER_MOBILE',{width:390,height:844}]]){
    const c=await browser.newContext({viewport}),v=await c.newPage(); await login(v,vu,vp);
    await v.waitForFunction(()=>Number(document.querySelector('#statTotal')?.textContent||'-1')===1,null,{timeout:30000});
    const cards=await v.locator('#cardsGrid .pcard').count(),text=await v.locator('#cardsGrid').innerText();
    if(cards!==1||!/GHR Constructor/i.test(text)) throw new Error(`${label}_provider_scope`);
    if(await v.locator('#adminSideSection').isVisible().catch(()=>false)) throw new Error(`${label}_admin_visible`);
    if(!await v.locator('#hxDivisasBtn').isVisible().catch(()=>false)) throw new Error(`${label}_divisas_not_visible`);
    const laboral=v.locator('#hxLaboralBtn');
    if(!await laboral.isVisible().catch(()=>false)) throw new Error(`${label}_laboral_not_visible`);
    await laboral.click();
    await v.locator('#hxlabImssPanel').waitFor({state:'visible',timeout:20000});
    if(viewport.width<600){const ov=await v.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);if(ov>8)throw new Error(`${label}_overflow_${ov}`);}
    append(`${label}_PERMISSIONS_LAYOUT=PASS`); await c.close();
  }
  append('BROWSER_CERTIFICATION=PASS'); overallPass=true;
}catch(e){append(`ERROR=${String(e.message||e).replace(/\s+/g,'_').slice(0,500)}`);append('BROWSER_CERTIFICATION=FAIL');}
finally{
  try{if(browser)await browser.close();}catch{}
  for(const id of tempIds){try{await at(`https://api.airtable.com/v0/${BASE}/${USERS}/${id}`,{method:'DELETE'});}catch{}}
  await sleep(1500);
  try{
    const u=await at(`https://api.airtable.com/v0/${BASE}/${USERS}?pageSize=100`);
    const rs=u.json?.records||[]; const left=rs.filter(r=>/^cert-v3-(admin|viewer)-/.test(String(r.fields?.Usuario||''))).length;
    append(left===0?'TEMP_USERS_CLEANUP=PASS':`TEMP_USERS_CLEANUP=FAIL:left_${left}`);
    append(rs.length===baselineUserCount?'REAL_USERS_BASELINE_RESTORED=PASS':`REAL_USERS_BASELINE_RESTORED=FAIL:baseline_${baselineUserCount}_count_${rs.length}`);
    if(left!==0||rs.length!==baselineUserCount) overallPass=false;
  }catch(e){append(`CLEANUP_VERIFY=FAIL:${String(e.message||e).replace(/\s+/g,'_')}`);overallPass=false;}
  append(overallPass?'OVERALL=PASS':'OVERALL=FAIL');
}
