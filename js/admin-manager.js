const adminRoot=document.getElementById('admin-root');
const orderStatuses=['New','Processing','Shipped','Completed','Cancelled'];
adminRoot.innerHTML='<div class="admin-login"><div class="admin-login-card"><span class="eyebrow">BAGGED CONTROL ROOM</span><h1>Checking your session…</h1></div></div>';

function renderLogin(message=''){
  adminRoot.innerHTML=`<div class="admin-login"><div class="admin-login-card"><img src="assets/logo.svg" class="admin-login-logo" alt="Bagged"><span class="eyebrow">PRIVATE DASHBOARD</span><h1>Welcome back.</h1><p>Manage products, inventory and orders from one place.</p><form id="login-form"><label>Email<input type="email" name="email" required autocomplete="username" placeholder="you@example.com"></label><label>Password<input type="password" name="password" required autocomplete="current-password" placeholder="Enter your password"></label><p class="form-error" role="alert">${escapeHtml(message)}</p><button class="btn btn-primary full" type="submit">Sign in</button></form></div></div>`;
  document.getElementById('login-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const submit=form.querySelector('[type="submit"]');
    const values=new FormData(form);
    submit.disabled=true;
    submit.textContent='Signing in…';
    try{
      const {data,error}=await supabaseClient.auth.signInWithPassword({email:String(values.get('email')).trim(),password:String(values.get('password'))});
      if(error)throw error;
      await requireAdmin(data.user);
      await renderDashboard();
    }catch(error){
      if(error.code==='NOT_ADMIN')renderUnauthorized();
      else renderLogin(error.message||'Sign-in failed. Check your details and try again.');
    }
  });
}

async function requireAdmin(user){
  if(!user)throw new Error('Sign in with an authorized admin account.');
  const {data,error}=await supabaseClient.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
  if(error)throw error;
  if(!data){const denied=new Error('This account is not authorized to manage the store.');denied.code='NOT_ADMIN';throw denied;}
}

function renderUnauthorized(){
  adminRoot.innerHTML='<div class="admin-login"><div class="admin-login-card"><img src="assets/logo.svg" class="admin-login-logo" alt="Bagged"><span class="eyebrow">PRIVATE DASHBOARD</span><h1>Access not authorized.</h1><p class="form-error" role="alert">This authenticated account is not listed in the store admin allowlist.</p><button id="unauthorized-signout" class="btn btn-secondary">Sign out</button></div></div>';
  document.getElementById('unauthorized-signout').onclick=async()=>{await supabaseClient.auth.signOut();renderLogin();};
}

async function renderDashboard(){
  adminRoot.innerHTML='<div class="admin-login"><div class="admin-login-card"><span class="eyebrow">BAGGED CONTROL ROOM</span><h1>Loading shop data…</h1></div></div>';
  try{
    const {data:{session},error:sessionError}=await supabaseClient.auth.getSession();
    if(sessionError)throw sessionError;
    await requireAdmin(session?.user);
    await loadCatalog({admin:true,refresh:true});
    const {data:orders,error}=await supabaseClient.from('orders')
      .select('id,order_number,customer_name,customer_phone,total,status,created_at,order_items(product_name,quantity,unit_price)')
      .order('created_at',{ascending:false});
    if(error)throw error;
    const {data:boostOrders,error:boostError}=await supabaseClient.from('boost_orders')
      .select('id,product_id,plan_id,amount,status,payment_reference,activated_at,created_at,seller_profiles(store_name),products(name),boost_plans(name,days,priority)')
      .order('created_at',{ascending:false});
    if(boostError)throw boostError;
    const {data:verificationRequests,error:verificationError}=await supabaseClient.from('seller_verification_requests')
      .select('id,seller_id,legal_name,phone,location,id_type,id_last4,seller_note,status,rejection_reason,reviewed_at,created_at,seller_profiles(store_name,phone,location,verified)')
      .order('created_at',{ascending:false});
    if(verificationError)throw verificationError;
    renderDashboardContent(orders||[],boostOrders||[],verificationRequests||[]);
  }catch(error){
    if(error.code==='NOT_ADMIN'){renderUnauthorized();return;}
    adminRoot.innerHTML=`<div class="admin-login"><div class="admin-login-card"><span class="eyebrow">BAGGED CONTROL ROOM</span><h1>Dashboard unavailable.</h1><p class="form-error" role="alert">${escapeHtml(error.message||'Could not load the live shop data.')}</p><button id="retry-dashboard" class="btn btn-primary">Try again</button><button id="return-login" class="btn btn-secondary">Sign in again</button></div></div>`;
    document.getElementById('retry-dashboard').onclick=renderDashboard;
    document.getElementById('return-login').onclick=async()=>{await supabaseClient.auth.signOut();renderLogin();};
  }
}

function renderDashboardContent(orders,boostOrders=[],verificationRequests=[]){
  window.__baggedVerificationRequests=verificationRequests;
  const products=getProducts();
  const categories=catalogState.categories;
  const totalStock=products.reduce((sum,product)=>sum+product.stock,0);
  const revenue=orders.filter(order=>order.status!=='Cancelled').reduce((sum,order)=>sum+Number(order.total||0),0);
  adminRoot.innerHTML=`<div class="admin-shell"><aside class="admin-side"><img src="assets/logo-light.svg" class="admin-logo" alt="Bagged"><nav><a class="active" href="#overview">Overview</a><a href="#categories">Categories</a><a href="#products">Products</a><a href="#verification">Verification</a><a href="#boosts">Boosts</a><a href="#orders">Orders</a></nav><button id="logout" class="logout">Log out</button></aside><section class="admin-main"><div class="admin-top"><div><span class="eyebrow">BAGGED CONTROL ROOM</span><h1>Shop dashboard.</h1><p class="admin-note">All figures are from your live store data.</p></div><a class="btn btn-primary" href="index.html">View store ↗</a></div><div class="stat-grid"><div class="stat"><span>Products</span><strong>${products.length}</strong></div><div class="stat"><span>Categories</span><strong>${categories.length}</strong></div><div class="stat"><span>Total stock</span><strong>${totalStock}</strong></div><div class="stat"><span>Low stock</span><strong>${products.filter(product=>product.stock<=2&&!product.isSold).length}</strong></div><div class="stat"><span>Orders</span><strong>${orders.length}</strong></div><div class="stat"><span>Revenue</span><strong>${formatNaira(revenue)}</strong></div><div class="stat"><span>Seller checks</span><strong>${verificationRequests.filter(request=>request.status==="pending").length}</strong></div></div><section id="categories" class="admin-panel"><div class="panel-head"><div><span class="eyebrow">CATALOG</span><h2>Categories</h2></div><button id="add-category" class="btn btn-primary">+ Add category</button></div><div class="admin-table-wrap"><table><thead><tr><th>Icon</th><th>Name</th><th>Description</th><th></th></tr></thead><tbody>${categories.length?categories.map(category=>`<tr><td>${escapeHtml(category.icon||'🛍️')}</td><td>${escapeHtml(category.name)}</td><td>${escapeHtml(category.description||'')}</td><td><button class="table-btn" data-edit-category="${category.id}">Edit</button><button class="table-btn danger" data-delete-category="${category.id}">Delete</button></td></tr>`).join(''):'<tr><td colspan="4">No categories yet. Add any category to start your catalog.</td></tr>'}</tbody></table></div></section><section id="products" class="admin-panel"><div class="panel-head"><div><span class="eyebrow">INVENTORY</span><h2>Products</h2></div><button id="add-product" class="btn btn-primary">+ Add product</button></div><div class="admin-table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Visibility</th><th></th></tr></thead><tbody>${products.length?products.map(product=>`<tr><td><div class="table-product"><span class="table-art">${renderProductImage(product.image,'admin-product-image')}</span><span><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.condition)}${product.isFeatured?' · Featured':''}${product.isSale?' · Sale':''}</small></span></div></td><td>${escapeHtml(product.category)}</td><td>${product.isSale?`<del>${formatNaira(product.regularPrice)}</del> `:''}${formatNaira(product.price)}</td><td>${product.stock}</td><td><span class="status ${!product.isActive||product.isSold?'out':product.stock===0?'new':'in'}">${!product.isActive?'Hidden':product.isSold?'Sold':product.stock===0?'Out of stock':'Active'}</span></td><td><button class="table-btn" data-edit-product="${product.id}">Edit</button><button class="table-btn" data-duplicate-product="${product.id}">Duplicate</button><button class="table-btn danger" data-delete-product="${product.id}">Delete</button></td></tr>`).join(''):'<tr><td colspan="6">No products yet. Add a listing to start selling.</td></tr>'}</tbody></table></div></section><section id="orders" class="admin-panel"><div class="panel-head"><div><span class="eyebrow">SALES</span><h2>Recent orders</h2></div></div>${orders.length?`<div class="orders-list">${orders.slice(0,30).map(order=>`<article class="order-row"><div><b>${escapeHtml(order.order_number)}</b><span>${escapeHtml(order.customer_name)} · ${escapeHtml(order.customer_phone)}<br>${(order.order_items||[]).map(item=>`${escapeHtml(item.product_name)} × ${item.quantity}`).join(', ')}</span></div><strong>${formatNaira(order.total)}</strong><select class="status-select" data-order-status="${order.id}" aria-label="Update status for ${escapeHtml(order.order_number)}">${orderStatuses.map(status=>`<option ${order.status===status?'selected':''}>${status}</option>`).join('')}</select></article>`).join('')}</div>`:'<div class="empty-state compact"><div class="empty-bag">🛍</div><h3>No orders yet.</h3><p>Customer orders will show here.</p></div>'}</section></section></div>`;
  const verificationSection=document.createElement('section');
  verificationSection.id='verification';
  verificationSection.className='admin-panel';
  const pendingVerification=verificationRequests.filter(request=>request.status==='pending');
  verificationSection.innerHTML='<div class="panel-head"><div><span class="eyebrow">TRUST & SAFETY</span><h2>Seller verification</h2></div><strong>'+pendingVerification.length+' pending</strong></div>'+
    (verificationRequests.length
      ?'<div class="orders-list">'+verificationRequests.slice(0,50).map(request=>'<article class="order-row verification-row"><div><b>'+escapeHtml(request.seller_profiles?.store_name||'Unnamed seller')+'</b><span>'+escapeHtml(request.legal_name)+' · '+escapeHtml(request.phone)+' · '+escapeHtml(request.location)+'<br>'+escapeHtml(request.id_type)+(request.id_last4?' · ending '+escapeHtml(request.id_last4):'')+' · '+escapeHtml(request.status)+'</span>'+(request.seller_note?'<small>Seller note: '+escapeHtml(request.seller_note)+'</small>':'')+(request.rejection_reason?'<small>Review note: '+escapeHtml(request.rejection_reason)+'</small>':'')+'</div><strong>'+ (request.status==='approved'?'✓':request.status==='rejected'?'✕':'Pending') +'</strong><div>'+ (request.status==='pending'?'<button class="table-btn" data-approve-verification="'+request.id+'">Approve</button><button class="table-btn danger" data-reject-verification="'+request.id+'">Reject</button>':'<button class="table-btn" data-review-verification="'+request.id+'">Review</button>') +'</div></article>').join('')+'</div>'
      :'<div class="empty-state compact"><div class="empty-bag">🛡️</div><h3>No seller verification requests.</h3><p>Seller applications for identity review will appear here.</p></div>');
  const productsSection=adminRoot.querySelector('#products');
  if(productsSection)productsSection.parentNode.insertBefore(verificationSection,productsSection.nextSibling);

  const boostSection=document.createElement('section');
  boostSection.id='boosts';
  boostSection.className='admin-panel';
  boostSection.innerHTML=`<div class="panel-head"><div><span class="eyebrow">MONETIZATION</span><h2>Boost requests</h2></div><strong>${boostOrders.filter(order=>order.status==='pending').length} pending</strong></div>${boostOrders.length?`<div class="orders-list">${boostOrders.slice(0,50).map(order=>`<article class="order-row"><div><b>${escapeHtml(order.products?.name||'Listing')}</b><span>${escapeHtml(order.seller_profiles?.store_name||'Bagged seller')} · ${escapeHtml(order.boost_plans?.name||'Boost')} · ${formatNaira(order.amount)} · ${escapeHtml(order.status)}</span>${order.payment_reference?`<small>Ref: ${escapeHtml(order.payment_reference)}</small>`:''}</div><strong>${order.boost_plans?.days||0} days</strong><div>${order.status==='pending'?'<button class="table-btn" data-activate-boost="'+order.id+'">Activate</button><button class="table-btn danger" data-cancel-boost="'+order.id+'">Cancel</button>':'<span class="status '+(order.status==='active'?'in':'out')+'">'+escapeHtml(order.status)+'</span>'}</div></article>`).join('')}</div>`:'<div class="empty-state compact"><div class="empty-bag">🚀</div><h3>No boost requests yet.</h3><p>Seller boost requests will appear here.</p></div>'}`;
  const ordersSection=adminRoot.querySelector('#orders');
  if(ordersSection)ordersSection.parentNode.insertBefore(boostSection,ordersSection);

  document.getElementById('logout').onclick=async()=>{await supabaseClient.auth.signOut();renderLogin();};
  document.getElementById('add-product').onclick=()=>openProductForm();
  document.getElementById('add-category').onclick=()=>openCategoryForm();
  adminRoot.querySelectorAll('[data-edit-category]').forEach(button=>button.addEventListener('click',()=>openCategoryForm(categories.find(category=>category.id===button.dataset.editCategory))));
  adminRoot.querySelectorAll('[data-delete-category]').forEach(button=>button.addEventListener('click',()=>deleteCategory(button.dataset.deleteCategory)));
  adminRoot.querySelectorAll('[data-edit-product]').forEach(button=>button.addEventListener('click',()=>editProduct(button.dataset.editProduct)));
  adminRoot.querySelectorAll('[data-duplicate-product]').forEach(button=>button.addEventListener('click',()=>duplicateProduct(button.dataset.duplicateProduct)));
  adminRoot.querySelectorAll('[data-delete-product]').forEach(button=>button.addEventListener('click',()=>deleteProduct(button.dataset.deleteProduct)));
  adminRoot.querySelectorAll('[data-approve-verification]').forEach(button=>button.addEventListener('click',()=>reviewSellerVerification(button.dataset.approveVerification,'approved')));
  adminRoot.querySelectorAll('[data-reject-verification]').forEach(button=>button.addEventListener('click',()=>reviewSellerVerification(button.dataset.rejectVerification,'rejected')));
  adminRoot.querySelectorAll('[data-review-verification]').forEach(button=>button.addEventListener('click',()=>reviewSellerVerification(button.dataset.reviewVerification,'review')));
  adminRoot.querySelectorAll('[data-activate-boost]').forEach(button=>button.addEventListener('click',()=>activateBoost(button.dataset.activateBoost)));
  adminRoot.querySelectorAll('[data-cancel-boost]').forEach(button=>button.addEventListener('click',()=>cancelBoost(button.dataset.cancelBoost)));
  adminRoot.querySelectorAll('[data-order-status]').forEach(select=>select.addEventListener('change',()=>updateOrderStatus(select.dataset.orderStatus,select.value)));
}

function openCategoryForm(category=null){
  const modal=document.createElement('div');
  modal.className='modal';
  modal.innerHTML=`<div class="modal-card"><div class="panel-head"><div><span class="eyebrow">${category?'EDIT CATEGORY':'NEW CATEGORY'}</span><h2>${category?'Update category':'Add a category'}</h2></div><button type="button" class="close-modal" aria-label="Close">×</button></div><form id="category-form"><label>Name<input required name="name" maxlength="100" value="${escapeHtml(category?.name||'')}" placeholder="Any category"></label><label>Icon or emoji<input name="icon" maxlength="32" value="${escapeHtml(category?.icon||'🛍️')}" placeholder="🛍️"></label><label>Description<input name="description" maxlength="240" value="${escapeHtml(category?.description||'')}" placeholder="A short storefront description"></label><p class="form-error" role="alert"></p><button class="btn btn-primary full" type="submit">${category?'Save category':'Create category'}</button></form></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.close-modal').onclick=()=>modal.remove();
  modal.querySelector('#category-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const values=new FormData(form);
    const submit=form.querySelector('[type="submit"]');
    const errorBox=form.querySelector('.form-error');
    submit.disabled=true;
    try{
      const payload={name:String(values.get('name')).trim(),icon:String(values.get('icon')||'🛍️').trim(),description:String(values.get('description')||'').trim()};
      if(category){
        const {error}=await supabaseClient.from('categories').update(payload).eq('id',category.id);
        if(error)throw error;
      }else await ensureCategory(payload.name,payload);
      modal.remove();
      showToast(category?'Category updated.':'Category created.');
      await renderDashboard();
    }catch(error){errorBox.textContent=error.message||'Could not save the category.';submit.disabled=false;}
  });
}

async function deleteCategory(id){
  if(!confirm('Delete this category? Categories with products cannot be removed.'))return;
  try{
    const {error}=await supabaseClient.from('categories').delete().eq('id',id);
    if(error)throw error;
    showToast('Category deleted.');
    await renderDashboard();
  }catch(error){showToast(error.message||'Could not delete this category. Move its products first.');}
}

function productImagePreview(form){
  const preview=form.querySelector('[data-image-preview]');
  const urls=String(form.elements.images.value||'').split('\n').map(url=>url.trim()).filter(Boolean);
  const files=Array.from(form.elements.uploads.files||[]);
  preview.innerHTML=[...urls.map((url,index)=>`<div class="image-preview-item"><div>${renderProductImage(url,'admin-preview-image')}</div><span><button type="button" class="table-btn" data-move-image="${index}" ${index===0?'disabled':''}>↑</button><button type="button" class="table-btn" data-move-image="${index}" ${index===urls.length-1?'disabled':''}>↓</button><button type="button" class="table-btn danger" data-remove-image="${index}">Remove</button></span></div>`),...files.map(file=>`<div class="image-preview-item"><div><img class="admin-preview-image" src="${URL.createObjectURL(file)}" alt="${escapeHtml(file.name)}"></div><span>${escapeHtml(file.name)}</span></div>`)].join('');
  preview.querySelectorAll('[data-move-image]').forEach(button=>button.addEventListener('click',()=>{
    const index=Number(button.dataset.moveImage);
    const next=index+(button.textContent==='↑'?-1:1);
    [urls[index],urls[next]]=[urls[next],urls[index]];
    form.elements.images.value=urls.join('\n');
    productImagePreview(form);
  }));
  preview.querySelectorAll('[data-remove-image]').forEach(button=>button.addEventListener('click',()=>{
    urls.splice(Number(button.dataset.removeImage),1);
    form.elements.images.value=urls.join('\n');
    productImagePreview(form);
  }));
}

function openProductForm(product=null){
  const isEditing=Boolean(product?.id);
  const modal=document.createElement('div');
  modal.className='modal';
  const categoryOptions=catalogState.categories.map(category=>`<option value="${escapeHtml(category.name)}">`).join('');
  modal.innerHTML=`<div class="modal-card"><div class="panel-head"><div><span class="eyebrow">${isEditing?'EDIT PRODUCT':'NEW PRODUCT'}</span><h2>${isEditing?'Update listing':'Add a listing'}</h2></div><button type="button" class="close-modal" aria-label="Close">×</button></div><p class="form-hint">Enter any category. Categories are not restricted to a product type.</p><form id="product-form"><label>Product name<input required name="name" maxlength="200" value="${escapeHtml(product?.name||'')}"></label><label>Category<input required name="category" list="category-list" value="${escapeHtml(product?.category||'')}" placeholder="Choose or type any category"><datalist id="category-list">${categoryOptions}</datalist></label><div class="two-col"><label>Price<input required type="number" min="0" step="0.01" name="price" value="${product?.regularPrice??''}"></label><label>Stock<input required type="number" min="0" step="1" name="stock" value="${product?.stock??''}"></label></div><div class="two-col"><label>Condition<input name="condition" maxlength="80" value="${escapeHtml(product?.condition||'New')}"></label><label>Badge<input name="badge" maxlength="60" value="${escapeHtml(product?.badge||'')}" placeholder="New / Best seller"></label></div><div class="two-col"><label>Sale price<input type="number" min="0" step="0.01" name="salePrice" value="${product?.salePrice??''}" placeholder="Optional"></label><label>Listing status<select name="status"><option value="published" ${product?.status==='published'?'selected':''}>Published</option><option value="draft" ${product?.status==='draft'?'selected':''}>Draft</option><option value="archived" ${product?.status==='archived'?'selected':''}>Archived</option></select></label></div><label>Description<textarea required name="description" rows="4" maxlength="10000">${escapeHtml(product?.description||'')}</textarea></label><label>Image URLs, one per line<textarea name="images" rows="3" placeholder="https://…">${escapeHtml((product?.imageUrls||[]).join('\n'))}</textarea></label><div data-image-preview class="image-preview-grid"></div><label>Upload images<input type="file" name="uploads" accept="image/jpeg,image/png,image/webp,image/gif" multiple></label><div class="product-options"><label><input type="checkbox" name="featured" ${product?.isFeatured?'checked':''}> Featured</label><label><input type="checkbox" name="sale" ${product?.isSale?'checked':''}> On sale</label><label><input type="checkbox" name="active" ${product?.isActive!==false?'checked':''}> Active on storefront</label><label><input type="checkbox" name="sold" ${product?.isSold?'checked':''}> Mark sold</label></div><p class="form-error" role="alert"></p><button class="btn btn-primary full" type="submit">${isEditing?'Save changes':'Publish product'}</button></form></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.close-modal').onclick=()=>modal.remove();
  const form=modal.querySelector('#product-form');
  form.elements.images.addEventListener('input',()=>productImagePreview(form));
  form.elements.uploads.addEventListener('change',()=>productImagePreview(form));
  productImagePreview(form);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const values=new FormData(form);
    const submit=form.querySelector('[type="submit"]');
    const errorBox=form.querySelector('.form-error');
    const price=Number(values.get('price'));
    const salePrice=values.get('salePrice')===''?null:Number(values.get('salePrice'));
    if(values.has('sale')&&(salePrice===null||salePrice>=price)){errorBox.textContent='Enter a sale price below the regular price.';return;}
    submit.disabled=true;
    submit.textContent='Saving product…';
    errorBox.textContent='';
    try{
      const category=await ensureCategory(values.get('category'));
      const uploaded=await uploadProductImages(Array.from(values.getAll('uploads')));
      const imageUrls=[...String(values.get('images')||'').split('\n').map(url=>url.trim()).filter(Boolean),...uploaded];
      const payload={
        category_id:category.id,
        name:String(values.get('name')).trim(),
        description:String(values.get('description')).trim(),
        condition:String(values.get('condition')||'New').trim()||'New',
        price,
        sale_price:values.has('sale')?salePrice:null,
        stock:Number(values.get('stock')),
        images:imageUrls,
        image_urls:imageUrls,
        badge:String(values.get('badge')||'').trim(),
        is_featured:values.has('featured'),
        is_sale:values.has('sale'),
        is_sold:values.has('sold'),
        is_active:values.has('active'),
        status:String(values.get('status')),
        updated_at:new Date().toISOString()
      };
      const request=isEditing
        ?supabaseClient.from('products').update(payload).eq('id',product.id).select('id').single()
        :supabaseClient.from('products').insert(payload).select('id').single();
      const {error}=await request;
      if(error)throw error;
      if(product){
        const removed=(product.imageUrls||[]).filter(url=>!imageUrls.includes(url));
        if(removed.length)await deleteProductImages(removed);
      }
      modal.remove();
      showToast(isEditing?'Product updated.':'Product published.');
      await renderDashboard();
    }catch(error){errorBox.textContent=error.message||'Could not save the product.';submit.disabled=false;submit.textContent=isEditing?'Save changes':'Publish product';}
  });
}

function editProduct(id){const product=getProducts().find(item=>item.id===id);if(product)openProductForm(product);}
function duplicateProduct(id){const product=getProducts().find(item=>item.id===id);if(product)openProductForm({...product,id:null,name:`${product.name} copy`});}

async function deleteProduct(id){
  if(!confirm('Delete this product?'))return;
  const product=getProducts().find(item=>item.id===id);
  try{
    const {error}=await supabaseClient.from('products').delete().eq('id',id);
    if(error)throw error;
    if(product?.imageUrls?.length)await deleteProductImages(product.imageUrls);
    showToast('Product deleted.');
    await renderDashboard();
  }catch(error){showToast(error.message||'Could not delete the product.');}
}

async function reviewSellerVerification(id,decision){
  const requests=window.__baggedVerificationRequests||[];
  const request=requests.find(item=>item.id===id);
  if(!request)return;
  if(decision==='review'){
    alert(
      'Seller: '+(request.seller_profiles?.store_name||'Unnamed seller')+'\\n'+
      'Legal name: '+request.legal_name+'\\n'+
      'Phone: '+request.phone+'\\n'+
      'Location: '+request.location+'\\n'+
      'ID: '+request.id_type+(request.id_last4?' ending '+request.id_last4:'')+'\\n\\n'+
      (request.seller_note||'No seller note.')
    );
    return;
  }
  let reason='';
  if(decision==='rejected'){
    reason=prompt('Why is this verification being rejected?','Please provide correct identity details and contact Bagged for review.');
    if(reason===null)return;
    reason=reason.trim();
    if(!reason){showToast('Add a rejection reason.');return;}
  }else if(!confirm('Approve identity verification for '+(request.seller_profiles?.store_name||'this seller')+'?'))return;
  try{
    const {error}=await supabaseClient.rpc('review_seller_verification',{p_request_id:id,p_decision:decision,p_rejection_reason:reason||null});
    if(error)throw error;
    showToast(decision==='approved'?'Seller verified. ✅':'Verification rejected.');
    await renderDashboard();
  }catch(error){showToast(error.message||'Could not review seller verification.');}
}

async function activateBoost(id){
  const reference=prompt('Enter the payment reference (optional):','');
  try{
    const {error}=await supabaseClient.rpc('admin_activate_boost',{p_boost_order_id:id,p_payment_reference:reference||''});
    if(error)throw error;
    showToast('Boost activated. 🚀');
    await renderDashboard();
  }catch(error){showToast(error.message||'Could not activate the boost.');}
}

async function cancelBoost(id){
  if(!confirm('Cancel this boost request?'))return;
  try{
    const {error}=await supabaseClient.rpc('admin_cancel_boost',{p_boost_order_id:id});
    if(error)throw error;
    showToast('Boost request cancelled.');
    await renderDashboard();
  }catch(error){showToast(error.message||'Could not cancel the boost request.');}
}

async function updateOrderStatus(id,status){
  try{
    const {error}=await supabaseClient.from('orders').update({status}).eq('id',id);
    if(error)throw error;
    showToast('Order updated.');
  }catch(error){showToast(error.message||'Could not update the order.');await renderDashboard();}
}

async function initializeAdmin(){
  if(!supabaseClient){adminRoot.innerHTML=`<div class="admin-login"><div class="admin-login-card"><h1>Connection unavailable.</h1><p class="form-error" role="alert">${escapeHtml(window.supabaseClientError||'The sign-in service could not load.')}</p><button class="btn btn-primary" onclick="location.reload()">Try again</button></div></div>`;return;}
  try{
    const {data,error}=await supabaseClient.auth.getSession();
    if(error)throw error;
    if(!data.session){renderLogin();return;}
    await requireAdmin(data.session.user);
    await renderDashboard();
  }catch(error){if(error.code==='NOT_ADMIN')renderUnauthorized();else renderLogin(error.message||'Could not verify your admin session.');}
}

initializeAdmin();
