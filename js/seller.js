const sellerRoot=document.getElementById('seller-root');
let sellerUser=null;
let sellerProfile=null;
let sellerProducts=[];
let sellerCategories=[];
let sellerBoostPlans=[];
let sellerBoostOrders=[];
let sellerVerificationRequest=null;
let sellerNotifications=[];
let sellerNotificationsReady=false;
let sellerNotificationChannel=null;
let sellerNotificationPoll=null;

function renderSellerVerification(){
  const verified=sellerProfile?.verified===true && sellerProfile?.verification_status==='verified';
  const status=sellerProfile?.verification_status||'unverified';
  if(verified){
    return '<section class="seller-panel seller-verification-panel verified"><div class="panel-heading"><div><span class="eyebrow">SELLER TRUST</span><h2>Identity verified. ✓</h2></div><span class="seller-status">✓ Verified</span></div><p>Your identity has been manually reviewed by Bagged. You can publish listings and build your seller reputation.</p><div class="verification-proof"><span>✓ Identity checked</span><span>✓ Seller privileges unlocked</span></div></section>';
  }
  if(sellerVerificationRequest?.status==='pending'){
    return '<section class="seller-panel seller-verification-panel pending"><div class="panel-heading"><div><span class="eyebrow">SELLER TRUST</span><h2>Verification is being reviewed.</h2></div><span class="seller-status">Pending</span></div><p>Bagged is reviewing your seller details. We may contact you to inspect your government ID. You cannot publish listings until approval.</p><div class="verification-proof"><span>Submitted '+escapeHtml(sellerVerificationRequest.legal_name)+'</span><span>'+escapeHtml(sellerVerificationRequest.id_type)+'</span></div></section>';
  }
  const rejection=sellerVerificationRequest?.status==='rejected' ? '<p class="verification-rejection"><strong>Review note:</strong> '+escapeHtml(sellerVerificationRequest.rejection_reason||'Your last request was not approved. Check your details and submit again.')+'</p>' : '';
  return '<section class="seller-panel seller-verification-panel"><div class="panel-heading"><div><span class="eyebrow">SELLER TRUST</span><h2>Verify before you sell.</h2></div><span class="seller-status">Not verified</span></div><p>For launch, Bagged uses free manual verification. Submit your real details, then our admin will verify your identity before you can publish listings.</p>'+rejection+'<form id="verification-form" class="seller-form"><label>Full legal name<input required name="legalName" maxlength="160" value="'+escapeHtml(sellerVerificationRequest?.legal_name||'')+'" placeholder="Name on your government ID"></label><div class="two-col"><label>Phone number<input required name="phone" autocomplete="tel" maxlength="40" value="'+escapeHtml(sellerVerificationRequest?.phone||sellerProfile?.phone||'')+'" placeholder="0801 234 5678"></label><label>Location<input required name="location" maxlength="120" value="'+escapeHtml(sellerVerificationRequest?.location||sellerProfile?.location||'')+'" placeholder="City, State"></label></div><div class="two-col"><label>Government ID<select required name="idType"><option value="">Choose ID type</option><option>NIN</option><option>International passport</option><option>Driver\'s licence</option><option>Voter\'s card</option><option>Other government ID</option></select></label><label>Last digits only<input name="idLast4" inputmode="numeric" maxlength="12" value="'+escapeHtml(sellerVerificationRequest?.id_last4||'')+'" placeholder="Last 4 digits (optional)"></label></div><label>Anything we should know?<textarea name="sellerNote" rows="3" maxlength="600" placeholder="Optional context for the Bagged admin."></textarea><small class="verification-privacy">Never enter your full NIN, BVN, password, or upload an ID document here. Bagged will contact you for the manual ID check.</small><p id="verification-message" class="seller-message" role="status"></p><button class="btn btn-primary full" type="submit">Submit verification request →</button></form></section>';
}

async function submitSellerVerification(event){
  event.preventDefault();
  const form=event.currentTarget;
  const submit=form.querySelector('[type="submit"]');
  const values=new FormData(form);
  const legalName=String(values.get('legalName')||'').trim();
  const phone=String(values.get('phone')||'').trim();
  const location=String(values.get('location')||'').trim();
  const idType=String(values.get('idType')||'').trim();
  const idLast4=String(values.get('idLast4')||'').trim();
  const sellerNote=String(values.get('sellerNote')||'').trim();
  const message=document.getElementById('verification-message');
  if(legalName.length<3||phone.length<7||location.length<2||!idType){
    if(message)message.textContent='Complete your legal name, phone, location and ID type.';
    return;
  }
  if(idLast4 && !/^[0-9A-Za-z]{4,12}$/.test(idLast4)){
    if(message)message.textContent='Use only the last digits of the ID.';
    return;
  }
  submit.disabled=true;
  submit.textContent='Submitting…';
  try{
    const {data,error}=await supabaseClient.from('seller_verification_requests').insert({
      seller_id:sellerUser.id,
      legal_name:legalName,
      phone,
      location,
      id_type:idType,
      id_last4:idLast4||null,
      seller_note:sellerNote||null
    }).select('*').single();
    if(error)throw error;
    await supabaseClient.from('seller_profiles').update({
      phone,
      location,
      verification_status:'pending',
      updated_at:new Date().toISOString()
    }).eq('user_id',sellerUser.id);
    sellerVerificationRequest=data;
    sellerProfile={...sellerProfile,phone,location,verification_status:'pending'};
    showToast('Verification request sent. ✅');
    renderSellerPage();
  }catch(error){
    if(message)message.textContent=error.message||'Could not submit your verification request.';
  }finally{
    submit.disabled=false;
    submit.textContent='Submit verification request →';
  }
}

function bindSellerVerification(){
  const form=document.getElementById('verification-form');
  if(form)form.addEventListener('submit',submitSellerVerification);
}

function notificationTime(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  return date.toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'});
}

function updateSellerNotificationBadge(){
  const badge=document.getElementById('seller-notification-count');
  if(!badge)return;
  const unread=sellerNotifications.filter(item=>!item.read_at).length;
  badge.textContent=unread>99?'99+':String(unread);
  badge.classList.toggle('hidden',unread===0);
}

function renderSellerNotifications(){
  const panel=document.getElementById('seller-notifications-panel');
  if(!panel)return;
  const unread=sellerNotifications.filter(item=>!item.read_at).length;
  panel.innerHTML='<div class="seller-notifications-head"><div><span class="eyebrow">SELLER ALERTS</span><strong>'+unread+' unread</strong></div><button class="table-btn" type="button" id="mark-all-seller-notifications">'+(unread?'Mark all read':'All caught up')+'</button></div>'+
    (sellerNotifications.length
      ?'<div class="seller-notification-list">'+sellerNotifications.slice(0,20).map(item=>'<button type="button" class="seller-notification '+(item.read_at?'read':'unread')+'" data-mark-notification="'+escapeHtml(item.id)+'"><span class="seller-notification-icon">🎉</span><span class="seller-notification-copy"><strong>'+escapeHtml(item.title||'You made a sale!')+'</strong><span>'+escapeHtml(item.body||'A customer ordered one of your listings.')+'</span><small>'+escapeHtml(notificationTime(item.created_at))+'</small></span><span class="seller-notification-dot" aria-hidden="true"></span></button>').join('')+'</div>'
      :'<div class="seller-notifications-empty"><div>🔔</div><strong>No sales yet.</strong><p>When a buyer orders one of your listings, you’ll see it here.</p></div>');
  updateSellerNotificationBadge();
  panel.querySelectorAll('[data-mark-notification]').forEach(button=>button.addEventListener('click',()=>markSellerNotificationRead(button.dataset.markNotification)));
  panel.querySelector('#mark-all-seller-notifications')?.addEventListener('click',markAllSellerNotificationsRead);
}

async function loadSellerNotifications(){
  if(!sellerUser)return;
  const {data,error}=await supabaseClient
    .from('seller_notifications')
    .select('id,order_id,product_id,product_name,quantity,order_number,title,body,read_at,created_at')
    .eq('seller_id',sellerUser.id)
    .order('created_at',{ascending:false})
    .limit(20);
  if(error)throw error;
  sellerNotifications=data||[];
  sellerNotificationsReady=true;
  renderSellerNotifications();
}

async function markSellerNotificationRead(id){
  if(!id||!sellerUser)return;
  const target=sellerNotifications.find(item=>item.id===id);
  if(!target||target.read_at)return;
  const {error}=await supabaseClient
    .from('seller_notifications')
    .update({read_at:new Date().toISOString()})
    .eq('id',id)
    .eq('seller_id',sellerUser.id);
  if(error){showToast(error.message||'Could not mark notification as read.');return;}
  target.read_at=new Date().toISOString();
  renderSellerNotifications();
}

async function markAllSellerNotificationsRead(){
  if(!sellerUser||!sellerNotifications.some(item=>!item.read_at))return;
  const readAt=new Date().toISOString();
  const {error}=await supabaseClient
    .from('seller_notifications')
    .update({read_at:readAt})
    .eq('seller_id',sellerUser.id)
    .is('read_at',null);
  if(error){showToast(error.message||'Could not mark notifications as read.');return;}
  sellerNotifications.forEach(item=>{if(!item.read_at)item.read_at=readAt;});
  renderSellerNotifications();
}

function setupSellerNotificationUI(){
  const button=document.getElementById('seller-notification-btn');
  const panel=document.getElementById('seller-notifications-panel');
  if(!button||!panel||button.dataset.bound)return;
  button.classList.remove('hidden');
  button.dataset.bound='true';
  button.addEventListener('click',event=>{
    event.stopPropagation();
    const isOpen=!panel.classList.contains('hidden');
    panel.classList.toggle('hidden',isOpen);
    button.setAttribute('aria-expanded',isOpen?'false':'true');
  });
  document.addEventListener('click',event=>{
    if(panel.classList.contains('hidden'))return;
    if(button.contains(event.target)||panel.contains(event.target))return;
    panel.classList.add('hidden');
    button.setAttribute('aria-expanded','false');
  });
}

function subscribeSellerNotifications(){
  if(!sellerNotificationsReady||!sellerUser||sellerNotificationChannel)return;
  sellerNotificationChannel=supabaseClient.channel('seller-notifications-'+sellerUser.id)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'seller_notifications',filter:'seller_id=eq.'+sellerUser.id},payload=>{
      const notification=payload.new;
      if(!notification||sellerNotifications.some(item=>item.id===notification.id))return;
      sellerNotifications=[notification,...sellerNotifications].slice(0,20);
      renderSellerNotifications();
      showToast('🎉 '+(notification.title||'You just made a sale!'));
    })
    .subscribe();
  sellerNotificationPoll=setInterval(async()=>{
    if(document.hidden)return;
    try{await loadSellerNotifications();}catch{}
  },30000);
}


function sellerMessage(message,type='status'){
  const box=document.getElementById('seller-message');
  if(box){box.textContent=message;box.className='seller-message '+(type==='error'?'form-error':'catalog-message');}
}

function sellerFormValues(){
  const form=document.getElementById('listing-form');
  const values=new FormData(form);
  return {
    id:String(values.get('listingId')||'').trim(),
    name:String(values.get('name')||'').trim(),
    category:String(values.get('category')||'').trim(),
    price:Number(values.get('price')),
    stock:Number(values.get('stock')),
    condition:String(values.get('condition')||'New').trim()||'New',
    description:String(values.get('description')||'').trim(),
    images:String(values.get('images')||'').split('\n').map(x=>x.trim()).filter(Boolean),
    files:Array.from(values.getAll('uploads')||[])
  };
}

function renderSellerPage(){
  const categoryOptions=sellerCategories.map(c=>'<option value="'+escapeHtml(c.name)+'">'+escapeHtml(c.name)+'</option>').join('');
  sellerRoot.innerHTML=renderSellerVerification()+'<div class="seller-dashboard-grid">'+
    '<section class="seller-panel">'+
      '<div class="panel-heading"><div><span class="eyebrow">YOUR SELLER PROFILE</span><h2>Set up your shop.</h2></div><span class="seller-status">'+(sellerProfile?.verified?'✓ Verified':'Free seller')+'</span></div>'+
      '<form id="seller-profile-form" class="seller-form">'+
        '<label>Store name<input required name="storeName" maxlength="120" value="'+escapeHtml(sellerProfile?.store_name||'')+'" placeholder="e.g. Bahl Gadgets"></label>'+
        '<div class="two-col"><label>Phone<input name="phone" autocomplete="tel" maxlength="40" value="'+escapeHtml(sellerProfile?.phone||'')+'" placeholder="0801 234 5678"></label><label>Location<input name="location" maxlength="120" value="'+escapeHtml(sellerProfile?.location||'')+'" placeholder="Abuja, FCT"></label></div>'+
        '<label>About your shop<textarea name="bio" rows="3" maxlength="500" placeholder="Tell buyers what you sell.">'+escapeHtml(sellerProfile?.bio||'')+'</textarea></label>'+
        '<p id="profile-message" class="seller-message" role="status"></p>'+
        '<button class="btn btn-primary" type="submit">Save seller profile</button>'+
      '</form>'+
    '</section>'+
    '<section class="seller-panel">'+
      '<div class="panel-heading"><div><span class="eyebrow">NEW LISTING</span><h2 id="listing-heading">Post something.</h2></div><button id="reset-listing" class="table-btn" type="button">Clear</button></div>'+
      '<form id="listing-form" class="seller-form">'+
        '<input type="hidden" name="listingId" value="">'+
        '<label>What are you selling?<input required name="name" maxlength="200" placeholder="iPhone 13, sofa, PS5, laptop…"></label>'+
        '<div class="two-col"><label>Category<select required name="category">'+categoryOptions+'</select></label><label>Condition<select name="condition"><option>New</option><option>Used</option><option>Refurbished</option><option>Open box</option></select></label></div>'+
        '<div class="two-col"><label>Price<input required type="number" min="0" step="0.01" name="price" placeholder="650000"></label><label>Quantity<input required type="number" min="0" step="1" name="stock" value="1"></label></div>'+
        '<label>Description<textarea required name="description" rows="5" maxlength="10000" placeholder="Give buyers the details they need."></textarea></label>'+
        '<label class="upload-field">Photos<input type="file" name="uploads" accept="image/jpeg,image/png,image/webp,image/gif" multiple><small>Up to 6 photos. 10 MB each.</small></label>'+
        '<label id="existing-images-wrap" class="hidden">Current image URLs<textarea name="images" rows="3" placeholder="Keep these lines to keep existing photos."></textarea></label>'+
        '<div id="listing-preview" class="image-preview-grid"></div>'+
        '<p id="seller-message" class="seller-message" role="alert"></p>'+
        '<button class="btn btn-primary full" type="submit">Publish listing →</button>'+
      '</form>'+
    '</section>'+
  '</div>'+
  '<section class="seller-panel seller-listings"><div class="panel-heading"><div><span class="eyebrow">YOUR LISTINGS</span><h2>What you’re selling.</h2></div><strong>'+sellerProducts.length+' listing'+(sellerProducts.length===1?'':'s')+'</strong></div>'+
  (sellerProducts.length?sellerProducts.map(product=>'<article class="seller-listing"><div class="seller-listing-image">'+renderProductImage(product.image,'admin-product-image')+'</div><div class="seller-listing-main"><div class="mini-meta"><span>'+escapeHtml(product.category)+'</span><span>'+escapeHtml(product.condition)+'</span></div><h3>'+escapeHtml(product.name)+'</h3><strong>'+formatNaira(product.price)+'</strong><p>'+product.stock+' in stock · '+(product.isActive&&!product.isSold?'Live':'Not live')+(getActiveBoostForProduct(product.id)?' · 🚀 Boosted':'')+(getBoostOrderForProduct(product.id)?' · ⏳ Boost pending':'')+'</p></div><div class="seller-listing-actions"><button class="btn btn-secondary" type="button" data-edit-listing="'+product.id+'">Edit</button><button class="btn btn-dark" type="button" data-toggle-listing="'+product.id+'">'+(product.isActive&&!product.isSold?'Hide':'Show')+'</button><button class="btn btn-primary" type="button" data-boost-listing="'+product.id+'">🚀 Boost</button><button class="table-btn danger" type="button" data-delete-listing="'+product.id+'">Delete</button></div></article>').join(''):'<div class="seller-empty"><div>🛍️</div><h3>Your first listing goes here.</h3><p>Post something and it will appear in the Bagged marketplace.</p></div>')+
  '</section>'+
  '<section class="seller-growth seller-boost-section"><span class="eyebrow">GET SEEN</span><h2>Put your listing in the spotlight.</h2><p class="boost-lead">Boosts buy premium visibility. Your request is recorded here, then Bagged confirms payment and activates the placement.</p><div class="boost-plan-grid">'+sellerBoostPlans.map(plan=>'<div class="boost-plan"><span class="boost-plan-badge">🚀 '+escapeHtml(plan.name)+'</span><strong>'+formatNaira(plan.price)+'</strong><b>'+plan.days+' days</b><span>'+escapeHtml(plan.description||'Premium Featured placement')+'</span></div>').join('')+'</div></section>';

  bindSellerVerification();
  bindSellerForms();
}

function bindSellerForms(){
  document.getElementById('seller-profile-form').addEventListener('submit',saveSellerProfile);
  const listingForm=document.getElementById('listing-form');
  document.getElementById('reset-listing').addEventListener('click',resetListingForm);
  listingForm.elements.uploads.addEventListener('change',()=>renderListingPreview(listingForm));
  listingForm.elements.images.addEventListener('input',()=>renderListingPreview(listingForm));
  listingForm.addEventListener('submit',publishListing);
  sellerRoot.querySelectorAll('[data-edit-listing]').forEach(button=>button.addEventListener('click',()=>editListing(button.dataset.editListing)));
  sellerRoot.querySelectorAll('[data-toggle-listing]').forEach(button=>button.addEventListener('click',()=>toggleListing(button.dataset.toggleListing)));
  sellerRoot.querySelectorAll('[data-delete-listing]').forEach(button=>button.addEventListener('click',()=>deleteListing(button.dataset.deleteListing)));
  sellerRoot.querySelectorAll('[data-boost-listing]').forEach(button=>button.addEventListener('click',()=>openBoostModal(button.dataset.boostListing)));
  renderListingPreview(listingForm);
}

function renderListingPreview(form){
  const preview=document.getElementById('listing-preview');
  if(!preview)return;
  const urls=String(form.elements.images.value||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const files=Array.from(form.elements.uploads.files||[]).slice(0,6);
  preview.innerHTML=[...urls.map(url=>'<div class="image-preview-item"><div>'+renderProductImage(url,'admin-preview-image')+'</div><span>Current photo</span></div>'),...files.map(file=>'<div class="image-preview-item"><div><img class="admin-preview-image" src="'+URL.createObjectURL(file)+'" alt=""></div><span>'+escapeHtml(file.name)+'</span></div>')].join('');
}

async function loadSellerData(){
  const {data:{session},error:sessionError}=await supabaseClient.auth.getSession();
  if(sessionError)throw sessionError;
  sellerUser=session?.user||null;
  if(!sellerUser){
    sellerRoot.innerHTML='<section class="seller-login"><span class="eyebrow">SELL ON BAGGED</span><h2>Sign in before you sell.</h2><p>Create a free Bagged account, then come back here to post listings.</p><a class="btn btn-primary" href="account.html?mode=signup">Create seller account →</a><a class="btn btn-secondary" href="account.html">I already have an account</a></section>';
    return;
  }
  const [profileResult,productsResult,categoryResult,boostPlanResult,boostOrderResult,roleResult,verificationResult]=await Promise.all([
    supabaseClient.from('seller_profiles').select('*').eq('user_id',sellerUser.id).maybeSingle(),
    supabaseClient.from('products').select('id,category_id,categories(name),name,description,condition,price,sale_price,stock,images,image_urls,badge,is_featured,is_sale,is_sold,is_active,status,created_at,seller_id,boosted_until,boost_priority').eq('seller_id',sellerUser.id).order('created_at',{ascending:false}),
    supabaseClient.from('categories').select('id,name,icon,description').order('name'),
    supabaseClient.from('boost_plans').select('id,name,days,price,priority,description').eq('is_active',true).order('price'),
    supabaseClient.from('boost_orders').select('id,product_id,plan_id,amount,status,payment_reference,activated_at,created_at,boost_plans(name,days,priority,description)').eq('seller_id',sellerUser.id).order('created_at',{ascending:false}),
    supabaseClient.from('marketplace_preferences').select('role').eq('user_id',sellerUser.id).maybeSingle(),
    supabaseClient.from('seller_verification_requests').select('id,seller_id,legal_name,phone,location,id_type,id_last4,seller_note,status,rejection_reason,reviewed_at,created_at').eq('seller_id',sellerUser.id).order('created_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  if(profileResult.error)throw profileResult.error;
  if(productsResult.error)throw productsResult.error;
  if(categoryResult.error)throw categoryResult.error;
  if(boostPlanResult.error)throw boostPlanResult.error;
  if(boostOrderResult.error)throw boostOrderResult.error;
  if(roleResult.error)throw roleResult.error;
  if(verificationResult.error)throw verificationResult.error;
  sellerProfile=profileResult.data||{store_name:'',phone:'',location:'',bio:'',verified:false,verification_status:'unverified',plan:'free'};
  sellerVerificationRequest=verificationResult.data||null;
  const marketplaceRole=roleResult.data?.role||null;
  if(marketplaceRole==='buyer'){
    sellerRoot.innerHTML='<section class="seller-login"><span class="eyebrow">SELLER CENTER</span><h2>Seller tools are off.</h2><p>Your Bagged account is currently in Buyer mode. Switch to Seller or Both in Account to open Seller Center.</p><a class="btn btn-primary" href="account.html">Open account settings →</a><a class="btn btn-secondary" href="shop.html">Keep shopping</a></section>';
    return;
  }
  if(!marketplaceRole && sellerProfile.store_name){try{await setMarketplaceRole('seller');}catch{}}
  sellerBoostPlans=boostPlanResult.data||[];
  sellerBoostOrders=boostOrderResult.data||[];
  try{await loadSellerNotifications();}catch{sellerNotifications=[];sellerNotificationsReady=false;}
  setupSellerNotificationUI();
  subscribeSellerNotifications();
  sellerProducts=(productsResult.data||[]).map(mapProduct);
  sellerCategories=(categoryResult.data||[]).map(mapCategory);
  renderSellerPage();
}

async function saveSellerProfile(event){
  event.preventDefault();
  const form=event.currentTarget;
  const values=new FormData(form);
  const submit=form.querySelector('[type="submit"]');
  const message=document.getElementById('profile-message');
  submit.disabled=true; message.textContent='';
  try{
    const storeName=String(values.get('storeName')||'').trim();
    if(storeName.length<2)throw new Error('Enter a seller/store name.');
    const payload={user_id:sellerUser.id,store_name:storeName,phone:String(values.get('phone')||'').trim(),location:String(values.get('location')||'').trim(),bio:String(values.get('bio')||'').trim(),updated_at:new Date().toISOString()};
    const {data,error}=await supabaseClient.from('seller_profiles').upsert(payload,{onConflict:'user_id'}).select('*').single();
    if(error)throw error;
    sellerProfile=data;
    message.textContent='Seller profile saved.';
    sellerRoot.querySelector('.seller-status').textContent=data.verified?'✓ Verified':'Free seller';
  }catch(error){message.textContent=error.message||'Could not save your seller profile.';message.className='seller-message form-error';}
  finally{submit.disabled=false;}
}

async function publishListing(event){
  event.preventDefault();
  const form=event.currentTarget;
  const submit=form.querySelector('[type="submit"]');
  const listing=sellerFormValues();
  const errorBox=document.getElementById('seller-message');
  if(!(sellerProfile?.verified===true && sellerProfile?.verification_status==='verified')){
    errorBox.textContent='Verify your seller identity before publishing listings.';
    errorBox.className='seller-message form-error';
    return;
  }
  if(!sellerProfile?.store_name){
    errorBox.textContent='Save your seller profile first.';
    errorBox.className='seller-message form-error';
    return;
  }
  if(!listing.name||!listing.category||!listing.description||Number.isNaN(listing.price)||listing.price<0||Number.isNaN(listing.stock)||listing.stock<0){
    errorBox.textContent='Complete the listing details.';
    errorBox.className='seller-message form-error';
    return;
  }
  if(listing.files.length>6)listing.files=listing.files.slice(0,6);
  submit.disabled=true;
  submit.textContent=listing.id?'Saving listing…':'Publishing listing…';
  errorBox.textContent='';
  try{
    const category=sellerCategories.find(c=>c.name===listing.category);
    if(!category)throw new Error('Choose a valid Bagged category.');
    const uploaded=await uploadSellerProductImages(listing.files,sellerUser.id);
    const imageUrls=[...listing.images,...uploaded].filter(Boolean).slice(0,6);
    if(!imageUrls.length)throw new Error('Add at least one product photo.');
    const payload={category_id:category.id,name:listing.name,description:listing.description,condition:listing.condition,price:listing.price,sale_price:null,stock:listing.stock,images:imageUrls,image_urls:imageUrls,badge:'',is_featured:false,is_sale:false,is_sold:listing.stock===0,is_active:true,status:'published',seller_id:sellerUser.id,updated_at:new Date().toISOString()};
    const request=listing.id
      ?supabaseClient.from('products').update(payload).eq('id',listing.id).eq('seller_id',sellerUser.id).select('id').single()
      :supabaseClient.from('products').insert(payload).select('id').single();
    const {error}=await request;
    if(error)throw error;
    if(listing.id){
      const old=sellerProducts.find(p=>p.id===listing.id);
      const removed=(old?.imageUrls||[]).filter(url=>!imageUrls.includes(url));
      if(removed.length)await deleteProductImages(removed);
    }
    sellerMessage(listing.id?'Listing updated.':'Your listing is live on Bagged.');
    await refreshSellerData();
    resetListingForm();
  }catch(error){errorBox.textContent=error.message||'Could not publish this listing.';errorBox.className='seller-message form-error';}
  finally{submit.disabled=false;submit.textContent='Publish listing →';}
}

async function refreshSellerData(){
  const {data,error}=await supabaseClient.from('products').select('id,category_id,categories(name),name,description,condition,price,sale_price,stock,images,image_urls,badge,is_featured,is_sale,is_sold,is_active,status,created_at,seller_id,boosted_until,boost_priority').eq('seller_id',sellerUser.id).order('created_at',{ascending:false});
  if(error)throw error;
  sellerProducts=(data||[]).map(mapProduct);
  await refreshBoostData();
  const count=sellerRoot.querySelector('.seller-listings .panel-heading strong');
  if(count)count.textContent=sellerProducts.length+' listing'+(sellerProducts.length===1?'':'s');
  renderSellerListingsOnly();
}

function renderSellerListingsOnly(){
  const root=document.querySelector('.seller-listings');
  if(!root)return;
  const head=root.querySelector('.panel-heading');
  const heading=head?.outerHTML||'';
  root.innerHTML=heading+(sellerProducts.length?sellerProducts.map(product=>'<article class="seller-listing"><div class="seller-listing-image">'+renderProductImage(product.image,'admin-product-image')+'</div><div class="seller-listing-main"><div class="mini-meta"><span>'+escapeHtml(product.category)+'</span><span>'+escapeHtml(product.condition)+'</span></div><h3>'+escapeHtml(product.name)+'</h3><strong>'+formatNaira(product.price)+'</strong><p>'+product.stock+' in stock · '+(product.isActive&&!product.isSold?'Live':'Not live')+(getActiveBoostForProduct(product.id)?' · 🚀 Boosted':'')+(getBoostOrderForProduct(product.id)?' · ⏳ Boost pending':'')+'</p></div><div class="seller-listing-actions"><button class="btn btn-secondary" type="button" data-edit-listing="'+product.id+'">Edit</button><button class="btn btn-dark" type="button" data-toggle-listing="'+product.id+'">'+(product.isActive&&!product.isSold?'Hide':'Show')+'</button><button class="table-btn danger" type="button" data-delete-listing="'+product.id+'">Delete</button></div></article>').join(''):'<div class="seller-empty"><div>🛍️</div><h3>Your first listing goes here.</h3><p>Post something and it will appear in the Bagged marketplace.</p></div>');
  root.querySelectorAll('[data-edit-listing]').forEach(button=>button.addEventListener('click',()=>editListing(button.dataset.editListing)));
  root.querySelectorAll('[data-toggle-listing]').forEach(button=>button.addEventListener('click',()=>toggleListing(button.dataset.toggleListing)));
  root.querySelectorAll('[data-delete-listing]').forEach(button=>button.addEventListener('click',()=>deleteListing(button.dataset.deleteListing)));
  root.querySelectorAll('[data-boost-listing]').forEach(button=>button.addEventListener('click',()=>openBoostModal(button.dataset.boostListing)));
}

function editListing(id){
  const product=sellerProducts.find(p=>p.id===id);
  const form=document.getElementById('listing-form');
  if(!product||!form)return;
  form.elements.listingId.value=product.id;
  form.elements.name.value=product.name;
  form.elements.category.value=product.category;
  form.elements.condition.value=product.condition;
  form.elements.price.value=product.regularPrice;
  form.elements.stock.value=product.stock;
  form.elements.description.value=product.description;
  form.elements.images.value=(product.imageUrls||[]).join('\n');
  form.elements.uploads.value='';
  document.getElementById('listing-heading').textContent='Edit listing.';
  document.getElementById('existing-images-wrap').classList.remove('hidden');
  renderListingPreview(form);
  form.scrollIntoView({behavior:'smooth',block:'center'});
}

function resetListingForm(){
  const form=document.getElementById('listing-form');
  if(!form)return;
  form.reset();
  form.elements.listingId.value='';
  form.elements.stock.value='1';
  form.elements.images.value='';
  document.getElementById('listing-heading').textContent='Post something.';
  document.getElementById('existing-images-wrap').classList.add('hidden');
  renderListingPreview(form);
}

function getBoostOrderForProduct(productId){
  return sellerBoostOrders.find(order=>order.product_id===productId && order.status==='pending')||null;
}

function getActiveBoostForProduct(productId){
  const product=sellerProducts.find(item=>item.id===productId);
  if(!product?.boostedUntil || new Date(product.boostedUntil)<=new Date())return null;
  return sellerBoostOrders.find(order=>order.product_id===productId && order.status==='active')||null;
}

function openBoostModal(productId){
  const product=sellerProducts.find(item=>item.id===productId);
  if(!product)return;
  const pending=getBoostOrderForProduct(productId);
  const active=getActiveBoostForProduct(productId);
  const modal=document.createElement('div');
  modal.className='modal';
  const planCards=sellerBoostPlans.map(plan=>`<button type="button" class="boost-choice" data-boost-plan="${plan.id}"><span><b>${escapeHtml(plan.name)}</b><small>${plan.days} days · priority ${plan.priority}</small></span><strong>${formatNaira(plan.price)}</strong><span class="boost-choice-copy">${escapeHtml(plan.description||'Premium Featured placement')}</span></button>`).join('');
  modal.innerHTML=`<div class="modal-card boost-modal-card"><div class="panel-head"><div><span class="eyebrow">BOOST LISTING</span><h2>${escapeHtml(product.name)}</h2></div><button type="button" class="close-modal" aria-label="Close">×</button></div><p class="form-hint">${pending?'A boost request is already awaiting payment confirmation.':active?'This listing is already boosted. A new request will extend its placement after the current boost.':'Choose how long you want premium Featured visibility.'}</p><div class="boost-current">${active?'<b>🔥 Active until '+new Date(product.boostedUntil).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'})+'</b>':'No active boost'}</div><div class="boost-choice-grid">${planCards||'<p>No boost packages are available right now.</p>'}</div><p class="form-hint">Bagged records the request here. Payment is confirmed separately by the Bagged admin until online payments are connected.</p><p class="form-error boost-error" role="alert"></p></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.close-modal').onclick=()=>modal.remove();
  modal.querySelectorAll('[data-boost-plan]').forEach(button=>button.addEventListener('click',()=>requestBoost(product.id,button.dataset.boostPlan,modal)));
}

async function requestBoost(productId,planId,modal){
  const button=modal.querySelector('[data-boost-plan="'+planId+'"]');
  const errorBox=modal.querySelector('.boost-error');
  if(button)button.disabled=true;
  if(errorBox)errorBox.textContent='';
  try{
    const {data,error}=await supabaseClient.rpc('create_boost_request',{p_product_id:productId,p_plan_id:planId});
    if(error)throw error;
    showToast('Boost request created. 🚀');
    modal.remove();
    await refreshSellerData();
  }catch(error){
    if(errorBox)errorBox.textContent=error.message||'Could not create the boost request.';
    if(button)button.disabled=false;
  }
}

async function refreshBoostData(){
  const {data,error}=await supabaseClient.from('boost_orders').select('id,product_id,plan_id,amount,status,payment_reference,activated_at,created_at,boost_plans(name,days,priority,description)').eq('seller_id',sellerUser.id).order('created_at',{ascending:false});
  if(error)throw error;
  sellerBoostOrders=data||[];
}

async function toggleListing(id){
  const product=sellerProducts.find(p=>p.id===id);
  if(!product)return;
  try{
    const {error}=await supabaseClient.from('products').update({is_active:!(product.isActive&&!product.isSold),is_sold:false,updated_at:new Date().toISOString()}).eq('id',id).eq('seller_id',sellerUser.id);
    if(error)throw error;
    showToast(product.isActive?'Listing hidden.':'Listing is live again.');
    await refreshSellerData();
  }catch(error){showToast(error.message||'Could not update the listing.');}
}

async function deleteListing(id){
  const product=sellerProducts.find(p=>p.id===id);
  if(!product||!confirm('Delete this listing?'))return;
  try{
    const {error}=await supabaseClient.from('products').delete().eq('id',id).eq('seller_id',sellerUser.id);
    if(error)throw error;
    if(product.imageUrls?.length)await deleteProductImages(product.imageUrls);
    showToast('Listing deleted.');
    await refreshSellerData();
  }catch(error){showToast(error.message||'Could not delete the listing.');}
}

document.addEventListener('DOMContentLoaded',async()=>{
  updateBagCount();
  if(!supabaseClient){sellerRoot.innerHTML='<div class="catalog-message" role="alert">'+escapeHtml(window.supabaseClientError||'The seller service could not load.')+'</div>';return;}
  try{await loadSellerData();}catch(error){sellerRoot.innerHTML='<div class="catalog-message" role="alert">'+escapeHtml(error.message||'Could not load your seller dashboard.')+'</div>';}
  finally{finishLoading();}
});
