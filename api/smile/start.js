const crypto=require('crypto');

const send=(res,status,body)=>{
  res.status(status).setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
};

const need=(name)=>{
  const v=String(process.env[name]||'').trim();
  if(!v) throw new Error(name+' is not configured.');
  return v;
};

async function db(path,options={}){
  const base=need('SUPABASE_URL');
  const key=need('SUPABASE_SERVICE_ROLE_KEY');
  const r=await fetch(base+path,{...options,headers:{
    apikey:key,Authorization:'Bearer '+key,...(options.headers||{})
  }});
  const t=await r.text();
  let d=null; try{d=t?JSON.parse(t):null;}catch{d=t;}
  if(!r.ok) throw new Error(d?.message||d?.error||String(t||r.statusText));
  return d;
}

function signature(partnerId,key,timestamp){
  return crypto.createHmac('sha256',key).update(timestamp,'utf8').update(partnerId,'utf8').update('sid_request','utf8').digest('base64');
}

module.exports=async function(req,res){
  if(req.method!=='POST') return send(res,405,{error:'Method not allowed.'});
  try{
    const auth=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i);
    if(!auth) return send(res,401,{error:'Sign in to verify your seller identity.'});
    const userRes=await fetch(need('SUPABASE_URL')+'/auth/v1/user',{
      headers:{apikey:need('SUPABASE_SERVICE_ROLE_KEY'),Authorization:'Bearer '+auth[1].trim()}
    });
    if(!userRes.ok) return send(res,401,{error:'Your Bagged session is no longer valid. Please sign in again.'});
    const user=await userRes.json();
    const rows=await db('/rest/v1/seller_profiles?user_id=eq.'+encodeURIComponent(user.id)+'&select=user_id,store_name,phone,location,verified,verification_status&limit=1');
    const profile=rows?.[0];
    if(!profile) return send(res,400,{error:'Set up your seller profile before starting verification.'});
    if(profile.verified===true&&profile.verification_status==='verified') return send(res,400,{error:'Your seller identity is already verified.'});

    const pending=await db('/rest/v1/seller_verification_requests?seller_id=eq.'+encodeURIComponent(user.id)+'&status=eq.pending&provider=eq.smile_id&select=id,provider_job_id&order=created_at.desc&limit=1');
    if(pending?.[0]) return send(res,200,{request_id:pending[0].id,job_id:pending[0].provider_job_id,already_started:true,partner_id:need('SMILE_PARTNER_ID'),callback_url:need('SMILE_CALLBACK_URL'),environment:String(process.env.SMILE_SERVER||'sandbox').trim()==='1'||String(process.env.SMILE_SERVER||'sandbox').trim().toLowerCase()==='production'?'production':'sandbox'});

    const requestId=crypto.randomUUID();
    const smileUserId='bagged-user-'+crypto.randomUUID();
    const jobId='bagged-job-'+crypto.randomUUID();
    const legalName=String(user.user_metadata?.full_name||user.user_metadata?.name||profile.store_name||user.email||'Bagged seller').trim().slice(0,160);

    await db('/rest/v1/seller_verification_requests',{
      method:'POST',
      headers:{'Content-Type':'application/json',Prefer:'return=representation'},
      body:JSON.stringify({id:requestId,seller_id:user.id,legal_name:legalName,phone:String(profile.phone||user.phone||'').trim()||'Not provided',location:String(profile.location||'Nigeria').trim()||'Nigeria',id_type:'SMILE_ID_BIOMETRIC_KYC',seller_note:'Automated identity verification through Smile ID.',status:'pending',provider:'smile_id',provider_user_id:smileUserId,provider_job_id:jobId,provider_status:'starting'})
    });
    await db('/rest/v1/seller_profiles?user_id=eq.'+encodeURIComponent(user.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({verification_status:'pending',updated_at:new Date().toISOString()})});

    const partnerId=need('SMILE_PARTNER_ID'),apiKey=need('SMILE_API_KEY'),callbackUrl=need('SMILE_CALLBACK_URL');
    const environment=String(process.env.SMILE_SERVER||'sandbox').trim()==='1'||String(process.env.SMILE_SERVER||'sandbox').trim().toLowerCase()==='production'?'production':'sandbox';
    const base=environment==='production'?'https://api.smileidentity.com/v1':'https://testapi.smileidentity.com/v1';
    const timestamp=new Date().toISOString();
    const tokenRes=await fetch(base+'/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:smileUserId,job_id:jobId,product:'biometric_kyc',callback_url:callbackUrl,partner_id:partnerId,signature:signature(partnerId,apiKey,timestamp),timestamp})});
    const tokenText=await tokenRes.text();
    let tokenData={}; try{tokenData=tokenText?JSON.parse(tokenText):{};}catch{}
    if(!tokenRes.ok||!tokenData.token){
      await db('/rest/v1/seller_verification_requests?id=eq.'+encodeURIComponent(requestId),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'withdrawn',provider_status:'error',provider_result_code:String(tokenData.code||tokenRes.status),provider_result_text:String(tokenData.error||'Smile ID could not start the verification session.').slice(0,300)})}).catch(()=>{});
      throw new Error(String(tokenData.error||'Smile ID could not start the verification session.'));
    }
    await db('/rest/v1/seller_verification_requests?id=eq.'+encodeURIComponent(requestId),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider_status:'pending'})});
    return send(res,200,{request_id:requestId,token:tokenData.token,job_id:jobId,partner_id:partnerId,callback_url:callbackUrl,environment});
  }catch(e){ return send(res,500,{error:e.message||'Could not start identity verification.'}); }
};