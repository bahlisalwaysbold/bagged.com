const accountRoot=document.getElementById('account-root');
let accountUser=null;
let accountView=new URLSearchParams(location.search).get('mode')==='update-password'?'update-password':'signin';
let accountNotice='';
let accountNoticeType='status';
let accountReady=false;
let accountSessionPending=true;
const accountSessionTimeoutMs=8000;

function accountRedirectUrl(){return new URL('account.html',location.href).href.split(/[?#]/)[0];}
function customerName(user){return user.user_metadata?.full_name||user.user_metadata?.name||'Bagged customer';}
function showAccountNotice(message,type='status'){accountNotice=message;accountNoticeType=type;renderAccount();}
function setGoogleButtonLabel(button,label){const text=button.querySelector('[data-google-label]');if(text)text.textContent=label;}

function renderAccount(){
  if(!supabaseClient&&!accountNotice){
    accountNotice=window.supabaseClientError||'The sign-in service could not load. Check your connection and retry.';
    accountNoticeType='alert';
  }
  if(accountView==='update-password'&&!accountUser){
    accountView='forgot';
    accountNotice='This password reset link is missing or expired. Request a new link below.';
    accountNoticeType='alert';
  }
  const notice=accountNotice?`<p class="auth-message ${accountNoticeType==='alert'?'form-error':'catalog-message'}" role="${accountNoticeType}" aria-live="polite">${escapeHtml(accountNotice)}</p>`:'';
  if(accountUser&&accountView!=='update-password'){
    accountRoot.innerHTML=`<section class="auth-panel account-summary"><span class="eyebrow">SIGNED IN</span><h2>${escapeHtml(customerName(accountUser))}</h2><p class="account-email">${escapeHtml(accountUser.email||'')}</p>${notice}<button id="sign-out" class="btn btn-secondary" type="button">Sign out</button></section>`;
    document.getElementById('sign-out').addEventListener('click',signOut);
    return;
  }
  if(accountView==='update-password'){
    accountRoot.innerHTML=`<section class="auth-panel"><span class="eyebrow">PASSWORD RESET</span><h2>Choose a new password.</h2>${accountSessionPending?'<p class="catalog-message" role="status">Verifying your reset link…</p>':''}${notice}<form id="update-password-form"><label>New password<input required type="password" name="password" autocomplete="new-password" minlength="8"></label><label>Confirm new password<input required type="password" name="confirmation" autocomplete="new-password" minlength="8"></label><button class="btn btn-primary full" type="submit" ${accountSessionPending||!supabaseClient?'disabled':''}>Save new password</button></form></section>`;
    document.getElementById('update-password-form').addEventListener('submit',updatePassword);
    return;
  }
  if(accountView==='forgot'){
    accountRoot.innerHTML=`<section class="auth-panel"><span class="eyebrow">PASSWORD RESET</span><h2>Get back into your account.</h2><p>We’ll email you a secure link to choose a new password.</p>${notice}<form id="forgot-password-form"><label>Email<input required type="email" name="email" autocomplete="email" placeholder="you@example.com"></label><button class="btn btn-primary full" type="submit">Send reset link</button></form><button class="auth-link" type="button" data-view="signin">Back to sign in</button></section>`;
    document.getElementById('forgot-password-form').addEventListener('submit',sendPasswordReset);
    bindViewButtons();
    return;
  }
  if(accountView==='signup'){
    accountRoot.innerHTML=`<section class="auth-panel"><span class="eyebrow">CREATE AN ACCOUNT</span><h2>Join Bagged.</h2><p>Your bag stays yours. Guest checkout is always available.</p>${notice}<form id="signup-form"><label>Full name<input required name="name" autocomplete="name" maxlength="120" placeholder="Your name"></label><label>Email<input required type="email" name="email" autocomplete="email" placeholder="you@example.com"></label><label>Password<input required type="password" name="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"></label><button class="btn btn-primary full" type="submit">Create account</button></form><div class="auth-divider"><span>or</span></div><button class="google-button" type="button" data-google><img src="assets/google-g.svg" alt="" aria-hidden="true"><span data-google-label>Continue with Google</span></button><p class="auth-switch">Already have an account? <button class="auth-link" type="button" data-view="signin">Sign in</button></p></section>`;
    document.getElementById('signup-form').addEventListener('submit',signUp);
    bindViewButtons();
    return;
  }
  accountRoot.innerHTML=`<section class="auth-panel"><span class="eyebrow">WELCOME BACK</span><h2>Sign in to Bagged.</h2><p>Or keep going as a guest. No account is required to shop.</p>${notice}<form id="signin-form"><label>Email<input required type="email" name="email" autocomplete="email" placeholder="you@example.com"></label><label>Password<input required type="password" name="password" autocomplete="current-password" placeholder="Your password"></label><button class="btn btn-primary full" type="submit">Sign in</button></form><button class="auth-link forgot-link" type="button" data-view="forgot">Forgot password?</button><div class="auth-divider"><span>or</span></div><button class="google-button" type="button" data-google><img src="assets/google-g.svg" alt="" aria-hidden="true"><span data-google-label>Continue with Google</span></button><p class="auth-switch">New to Bagged? <button class="auth-link" type="button" data-view="signup">Create an account</button></p></section>`;
  document.getElementById('signin-form').addEventListener('submit',signIn);
  bindViewButtons();
}

function bindViewButtons(){
  accountRoot.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    accountView=button.dataset.view;
    accountNotice='';
    renderAccount();
  }));
  accountRoot.querySelectorAll('[data-google]').forEach(button=>button.addEventListener('click',continueWithGoogle));
}

function setFormBusy(form,busy,label){
  const button=form.querySelector('[type="submit"]');
  if(!button)return;
  button.disabled=busy;
  if(busy){button.dataset.label=button.textContent;button.textContent=label;}
  else{button.textContent=button.dataset.label||button.textContent;delete button.dataset.label;}
}

async function signIn(event){
  event.preventDefault();
  if(!supabaseClient){showAccountNotice(window.supabaseClientError||'Sign-in is temporarily unavailable. Reload and try again.','alert');return;}
  const form=event.currentTarget;
  const values=new FormData(form);
  setFormBusy(form,true,'Signing in…');
  accountNotice='';
  try{
    const {data,error}=await supabaseClient.auth.signInWithPassword({email:String(values.get('email')).trim(),password:String(values.get('password'))});
    if(error)throw error;
    accountUser=data.user;
    accountNotice='You’re signed in.';
    renderAccount();
  }catch(error){setFormBusy(form,false);showAccountNotice(error.message||'Could not sign in. Check your details and try again.','alert');}
}

async function signUp(event){
  event.preventDefault();
  if(!supabaseClient){showAccountNotice(window.supabaseClientError||'Sign-up is temporarily unavailable. Reload and try again.','alert');return;}
  const form=event.currentTarget;
  const values=new FormData(form);
  setFormBusy(form,true,'Creating account…');
  accountNotice='';
  try{
    const {data,error}=await supabaseClient.auth.signUp({
      email:String(values.get('email')).trim(),
      password:String(values.get('password')),
      options:{data:{full_name:String(values.get('name')).trim()},emailRedirectTo:accountRedirectUrl()}
    });
    if(error)throw error;
    if(data.session){accountUser=data.user;accountNotice='Your email is verified. Welcome to Bagged.';accountView='signin';renderAccount();}
    else{accountView='signin';showAccountNotice('Check your inbox for a verification link before signing in.');}
  }catch(error){setFormBusy(form,false);showAccountNotice(error.message||'Could not create your account. Please try again.','alert');}
}

async function sendPasswordReset(event){
  event.preventDefault();
  if(!supabaseClient){showAccountNotice(window.supabaseClientError||'Password reset is temporarily unavailable. Reload and try again.','alert');return;}
  const form=event.currentTarget;
  const email=String(new FormData(form).get('email')).trim();
  setFormBusy(form,true,'Sending link…');
  try{
    const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:`${accountRedirectUrl()}?mode=update-password`});
    if(error)throw error;
    showAccountNotice('If an account exists for that email, a password reset link is on its way.');
  }catch(error){setFormBusy(form,false);showAccountNotice(error.message||'Could not send the reset email. Please try again.','alert');}
}

async function updatePassword(event){
  event.preventDefault();
  if(!supabaseClient){showAccountNotice(window.supabaseClientError||'Password update is temporarily unavailable. Reload and try again.','alert');return;}
  const form=event.currentTarget;
  const values=new FormData(form);
  if(values.get('password')!==values.get('confirmation')){showAccountNotice('The passwords do not match.','alert');return;}
  setFormBusy(form,true,'Saving password…');
  try{
    const {data,error}=await supabaseClient.auth.updateUser({password:String(values.get('password'))});
    if(error)throw error;
    accountUser=data.user;
    accountView='signin';
    history.replaceState(null,'',accountRedirectUrl());
    accountNotice='Your password has been updated.';
    renderAccount();
  }catch(error){setFormBusy(form,false);showAccountNotice(error.message||'Could not update your password. Request a new reset link and try again.','alert');}
}

async function continueWithGoogle(event){
  if(!supabaseClient){showAccountNotice(window.supabaseClientError||'Google sign-in is temporarily unavailable. Reload and try again.','alert');return;}
  const button=event.currentTarget;
  button.disabled=true;
  setGoogleButtonLabel(button,'Connecting…');
  try{
    const settingsResponse=await fetch(`${window.BAGGED_SUPABASE_CONFIG.url}/auth/v1/settings`,{
      headers:{apikey:window.BAGGED_SUPABASE_CONFIG.publishableKey}
    });
    if(!settingsResponse.ok)throw new Error('Could not check Google sign-in configuration. Try again later.');
    const settings=await settingsResponse.json();
    if(!settings.external?.google){
      button.disabled=false;
      setGoogleButtonLabel(button,'Continue with Google');
      showAccountNotice('Google sign-in is not enabled for this store yet. Use email sign-in or contact the store owner.','alert');
      return;
    }
    const {error}=await supabaseClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:accountRedirectUrl()}});
    if(error)throw error;
  }catch(error){
    button.disabled=false;
    setGoogleButtonLabel(button,'Continue with Google');
    showAccountNotice(error.message||'Google sign-in is unavailable.','alert');
  }
}

async function signOut(){
  if(!supabaseClient){showAccountNotice(window.supabaseClientError||'Sign-out is temporarily unavailable. Reload and try again.','alert');return;}
  try{
    const {error}=await supabaseClient.auth.signOut();
    if(error)throw error;
    accountUser=null;
    accountView='signin';
    accountNotice='You have been signed out.';
    renderAccount();
  }catch(error){showAccountNotice(error.message||'Could not sign out. Please try again.','alert');}
}

function initializeAccount(){
  renderAccount();
  if(!supabaseClient){
    accountReady=true;
    accountSessionPending=false;
    return;
  }
  try{
    supabaseClient.auth.onAuthStateChange((event,session)=>{
    accountUser=session?.user||null;
    if(event==='PASSWORD_RECOVERY')accountView='update-password';
    if(accountReady&&event==='SIGNED_OUT'){
      accountView='signin';
      accountNotice='You have been signed out.';
    }
    if(accountReady)renderAccount();
  });
  }catch(error){
    accountReady=true;
    accountSessionPending=false;
    showAccountNotice(error.message||'Could not initialize your sign-in session. You can still use the sign-in form.','alert');
  }

  let timeoutId;
  const timeout=new Promise(resolve=>{
    timeoutId=setTimeout(()=>resolve({timedOut:true}),accountSessionTimeoutMs);
  });
  Promise.race([
    Promise.resolve().then(()=>supabaseClient.auth.getSession()).then(result=>({result})),
    timeout
  ]).then(outcome=>{
    accountSessionPending=false;
    accountReady=true;
    if(outcome.timedOut){
      accountUser=null;
      if(accountView==='update-password')accountView='forgot';
      showAccountNotice('Your saved session could not be checked in time. You can still sign in; reload later to restore the session.','alert');
      return;
    }
    const {data,error}=outcome.result||{};
    if(error){
      accountUser=null;
      if(accountView==='update-password')accountView='forgot';
      showAccountNotice(error.message||'Could not check your saved session. You can still sign in.','alert');
      return;
    }
    accountUser=data.session?.user||null;
    const hashParams=new URLSearchParams(location.hash.slice(1));
    const queryParams=new URLSearchParams(location.search);
    const redirectError=hashParams.get('error_description')||hashParams.get('error')||queryParams.get('error_description')||queryParams.get('error');
    if(redirectError){
      accountNotice=redirectError.replaceAll('+',' ');
      accountNoticeType='alert';
      history.replaceState(null,'',accountRedirectUrl());
    }
    renderAccount();
  }).catch(error=>{
    accountSessionPending=false;
    accountReady=true;
    accountUser=null;
    if(accountView==='update-password')accountView='forgot';
    showAccountNotice(error.message||'Could not check your saved session. You can still sign in.','alert');
  }).finally(()=>clearTimeout(timeoutId));
}

initializeAccount();