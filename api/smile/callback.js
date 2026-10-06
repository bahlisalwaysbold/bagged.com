const crypto=require('crypto');

const send=(res,status,body='OK')=>{
  res.status(status).setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.end(typeof body==='string'?body:JSON.stringify(body));
};
const need=(name)=>{const v=String(process.env[name]||'').trim();if(!v)throw new Error(name+' is not configured.');return v;};

async function db(path,options={}){
  const base=need('SUPABASE_URL'),key=need('SUPABASE_SERVICE_ROLE_KEY');
  const r=await fetch(base+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,...(options.headers||{})}});
  const t=await r.text();let d=null;try{d=t?JSON.parse(t):null;}catch{d=t;}
  if(!r.ok)throw new Error(d?.message||d?.error||String(t||r.statusText));return d;
}

function validSignature(partnerId,key,timestamp,received){
  if(!timestamp||!received)return false;
  const expected=crypto.createHmac('sha256',key).update(String(timestamp),'utf8').update(partnerId,'utf8').update('sid_request','utf8').digest('base64');
  const a=Buffer.from(expected,'base64'),b=Buffer.from(String(received),'base64');
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
const pparams=(p)=>p?.PartnerParams||p?.partner_params||p?.partnerParams||{};
const isId=(p)=>Boolean(p?.IDType||p?.IDNumber||p?.FullName||p?.DOB||Object.prototype.hasOwnProperty.call(p||{},'IDNumberPreviouslyRegistered'));
const ACTION_PASS=new Set(['0810','1210']),ACTION_FAIL=new Set(['0811','0813','0911','0912','1211','1212']);
const ID_PASS=new Set(['1012']),ID_FAIL=new Set(['1013','1014']);
const TECH=new Set(['1015','1016','0908','2203','2204','2205','2212','2213','2214','2215','2220','2221','2314','2405']);

module.exports=async function(req,res){
  if(req.method!=='POST')return send(res,405,{error:'Method not allowed.'});
  try{
    const body=typeof req.body==='string'?(req.body?JSON.parse(req.body):{}):(req.body||{});
    const partnerId=need('SMILE_PARTNER_ID'),apiKey=need('SMILE_API_KEY');
    if(!validSignature(partnerId,apiKey,body.timestamp,body.signature))return send(res,401,{error:'Invalid callback signature.'});
    const pp=pparams(body),jobId=String(pp.job_id||'').trim(),providerUserId=String(pp.user_id||'').trim();
    if(!jobId||!providerUserId)return send(res,400,{error:'Missing Smile ID job identifiers.'});
    const rows=await db('/rest/v1/seller_verification_requests?provider=eq.smile_id&provider_job_id=eq.'+encodeURIComponent(jobId)+'&provider_user_id=eq.'+encodeURIComponent(providerUserId)+'&select=id,seller_id,status,provider_action_result_code,provider_id_result_code&limit=1');
    const request=rows?.[0];if(!request)return send(res,404,{error:'Verification request not found.'});

    const code=String(body.ResultCode||body.result_code||'').trim();
    const text=String(body.ResultText||body.result_text||'').trim().slice(0,300);
    const smileJobId=String(body.SmileJobID||body.smile_job_id||'').trim().slice(0,120);
    const idCallback=isId(body);
    const updates={provider_result_code:code||null,provider_result_text:text||null,provider_status:'processing'};
    if(smileJobId)updates.provider_smile_job_id=smileJobId;
    if(idCallback)updates.provider_id_result_code=code||null;else updates.provider_action_result_code=code||null;

    if(TECH.has(code))updates.provider_status='error';
    else if((idCallback&&ID_FAIL.has(code))||(!idCallback&&ACTION_FAIL.has(code)))updates.provider_status='rejected';
    else if((idCallback&&ID_PASS.has(code))||(!idCallback&&ACTION_PASS.has(code)))updates.provider_status='approved';
    else updates.provider_status='provisional';

    const nextAction=idCallback?request.provider_action_result_code:code,nextId=idCallback?code:request.provider_id_result_code;
    const actionPass=ACTION_PASS.has(String(nextAction||'')),idPass=ID_PASS.has(String(nextId||''));
    const actionFail=ACTION_FAIL.has(String(nextAction||'')),idFail=ID_FAIL.has(String(nextId||''));
    if(actionFail||idFail){
      updates.status='rejected';updates.rejection_reason=text||'Smile ID could not verify the submitted identity.';updates.provider_status='rejected';updates.reviewed_at=new Date().toISOString();
    }else if(actionPass&&idPass){
      const verifiedAt=new Date().toISOString();
      updates.status='approved';updates.rejection_reason=null;updates.provider_status='verified';updates.provider_verified_at=verifiedAt;updates.reviewed_at=verifiedAt;
      await db('/rest/v1/seller_profiles?user_id=eq.'+encodeURIComponent(request.seller_id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({verified:true,verification_status:'verified',verified_at:verifiedAt,verification_reviewed_at:verifiedAt,updated_at:verifiedAt})});
    }else if(request.status!=='rejected'&&request.status!=='approved')updates.status='pending';

    await db('/rest/v1/seller_verification_requests?id=eq.'+encodeURIComponent(request.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(updates)});
    return send(res,200,'OK');
  }catch(e){return send(res,500,{error:e.message||'Callback processing failed.'});}
};