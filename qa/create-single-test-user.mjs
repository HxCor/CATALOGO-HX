import fs from 'node:fs';
import crypto from 'node:crypto';

const API=process.env.API_BASE||'https://catalogo-hx-backend.armando-avila.workers.dev';
const TOKEN=process.env.AIRTABLE_TOKEN||'';
const BASE=process.env.AIRTABLE_BASE_ID||'';
const USERS=process.env.USERS_TABLE_ID||'tbleeFejdXclP3md1';
const USER='qa-hx-test';
const RESULT=process.env.RESULT_FILE||'single-test-user-result.txt';
const lines=[`CHECKED_AT_UTC=${new Date().toISOString().replace('.000','')}`];
const out=s=>{lines.push(s);fs.writeFileSync(RESULT,lines.join('\n')+'\n');};

function qaName(record){
  const f=record.fields||{};
  return String(f['Usuario (login)']||f.Usuario||'').trim().toLowerCase();
}
function isTestName(name){
  return /^(qa-hx-test|qa-|cert-v3-|release-|cert-|e2e-|test-)/i.test(name||'');
}
async function req(url,opts={}){
  const r=await fetch(url,opts); const text=await r.text(); let json=null;
  try{json=text?JSON.parse(text):null;}catch{}
  return {status:r.status,ok:r.ok,json,text};
}
async function airtable(path,opts={}){
  return req(`https://api.airtable.com/v0/${BASE}/${USERS}${path}`,{
    ...opts,
    headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json',...(opts.headers||{})}
  });
}

try{
  fs.writeFileSync(RESULT,lines.join('\n')+'\n');
  if(!TOKEN||!BASE) throw new Error('missing_secrets');
  out('SECRETS_CONFIGURED=PASS');

  const before=await airtable('?pageSize=100');
  if(!before.ok) throw new Error(`list_before_http_${before.status}`);
  const records=before.json?.records||[];
  const tests=records.filter(r=>isTestName(qaName(r)));
  for(const r of tests){
    const d=await airtable(`/${r.id}`,{method:'DELETE'});
    if(!d.ok) throw new Error(`delete_${r.id}_http_${d.status}`);
  }
  out(`OLD_TEST_USERS_REMOVED=PASS:count_${tests.length}`);

  const digest=crypto.createHmac('sha256',TOKEN).update('CATALOGO-HX-single-test-user-v1').digest('hex');
  const password=`Q!${digest.slice(0,18)}a9`;
  const created=await airtable('',{method:'POST',body:JSON.stringify({fields:{
    'Nombre completo':'CATALOGO HX QA TEST',
    'Usuario':USER,
    'Usuario (login)':USER,
    'Contraseña':password,
    'Rol':'viewer',
    'Empresas permitidas':'GCO1110249CA'
  }})});
  if(!created.ok||!created.json?.id) throw new Error(`create_http_${created.status}`);
  const id=created.json.id;
  out('SINGLE_TEST_USER_CREATED=PASS');

  const login=await req(`${API}/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:USER,password})});
  if(!login.ok||!login.json?.token) throw new Error(`login_http_${login.status}`);
  out(`TEST_USER_LOGIN=PASS:migration_${login.json?.migration||'unknown'}`);

  const check=await airtable(`/${id}`);
  if(!check.ok) throw new Error(`verify_record_http_${check.status}`);
  const f=check.json?.fields||{};
  if(String(f['Contraseña']||'').trim()) throw new Error('plaintext_password_remains');
  if(!String(f['Password Hash']||'').startsWith('hmac-sha256-v1$')) throw new Error('password_hash_missing');
  if(String(f.Rol||'').toLowerCase()!=='viewer') throw new Error('role_not_viewer');
  out('PASSWORD_HASH_ONLY=PASS');
  out('ROLE_VIEWER=PASS');

  const finalList=await airtable('?pageSize=100');
  if(!finalList.ok) throw new Error(`list_final_http_${finalList.status}`);
  const finalTests=(finalList.json?.records||[]).filter(r=>isTestName(qaName(r)));
  if(finalTests.length!==1||qaName(finalTests[0])!==USER) throw new Error(`test_user_count_${finalTests.length}`);
  out('ONLY_ONE_TEST_USER=PASS');
  out(`TOTAL_USERS=${(finalList.json?.records||[]).length}`);
  out('OVERALL=PASS');
}catch(e){
  out(`ERROR=${String(e?.message||e).replace(/\s+/g,'_').slice(0,300)}`);
  out('OVERALL=FAIL');
  process.exitCode=1;
}
