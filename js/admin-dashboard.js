const adminRoot = document.getElementById('admin-root');
const orderStatuses = ['New', 'Processing', 'Shipped', 'Completed', 'Cancelled'];
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
      const {data,error}=await supabaseClient.auth.signInWithPassword({
        email:String(values.get('email')).trim(),
        password:String(values.get('password'))
      });
      if(error) throw error;
      await requireAdmin(data.user);
      await renderDashboard();
    }catch(error){
      await supabaseClient.auth.signOut();
      renderLogin(error.message||'Sign-in failed. Check your credentials and try again.');
    }
  });
}

async function requireAdmin(user){
  if(!user) throw new Error('Sign in with an authorized admin account.');
  const {data,error}=await supabaseClient.from('admin_users')
    .select('user_id').eq('user_id',user.id).maybeSingle();
  if(error) throw error;
  if(!data) throw new Error('This account is not authorized to access the dashboard.');
}

async function renderDashboard(){
  adminRoot.innerHTML='<div class="admin-login"><div class="admin-login-card"><span class="eyebrow">BAGGED CONTROL ROOM</span><h1>Loading dashboard…</h1></div></div>';
  try{
    const {data:{session},error:sessionError}=await supabaseClient.auth.getSession();
    if(sessionError) throw sessionError;
    await requireAdmin(session?.user);
    await loadCatalog({admin:true,refresh:true});
    const {data:orders,error:ordersError}=await supabaseClient.from('orders')
      .select('id,order_number,customer_name,customer_phone,total,status,created_at,order_items(product_name,quantity,unit_price)')
      .order('created_at',{ascending:false});
    if(ordersError) throw ordersError;
    renderDashboardContent(orders||[]);
  }catch(error){
    adminRoot.innerHTML=`<div class="admin-login"><div class="admin-login-card"><span class="eyebrow">BAGGED CONTROL ROOM</span><h1>Dashboard unavailable.</h1><p class="form-error" role="alert">${escapeHtml(error.message||'Could not load your admin data.')}</p><button id="retry-dashboard" class="btn btn-primary">Try again</button><button id="return-login" class="btn btn-secondary">Sign in again</button></div></div>`;
    document.getElementById('retry-dashboard').onclick=renderDashboard;
    document.getElementById('return-login').onclick=async()=>{await supabaseClient.auth.signOut();renderLogin();};
  }
}

function renderDashboardContent(orders){
  const products=getProducts();
  const categories=catalogState.categories;
  adminRoot.innerHTML=`<div class="admin-shell"><aside class="admin-side"><img src="assets/logo-light.svg" class="admin-logo" alt="Bagged"><nav><a class="active" href="#overview">Overview</a><a href="#products">Products</a><a href="#orders">Orders / Inquiries</a></nav><button id="logout" class="logout">Log out</button></aside><section class="admin-main"><div class="admin-top"><div><span class="eyebrow">BAGGED CONTROL ROOM</span><h1>Shop dashboard.</h1><p class="admin-note">Sell anything — create any category you need.</p></div><a class="btn btn-primary" href="index.html">View store ↗</a></div><div class="stat-grid"><div class="stat"><span>Products</span><strong>${products.length}</strong></div><div class="stat"><span>Categories</span><strong>${categories.length}</strong></div><div class="stat"><span>Orders</span><strong>${orders.length}</strong></div><div class="stat"><span>Low stock</span><strong>${products.filter(product=>product.stock<=2&&!product.isSold).length}</strong></div></div><section id="products" class="admin-panel"><div class="panel-head"><div><span class="eyebrow">INVENTORY</span><h2>Your products</h2></div><div class="hero-actions"><button id="add-category" class="btn btn-secondary">Add category</button><button id="add-product" class="btn btn-primary">+ Add product</button></div></div><div class="category-chips">${categories.map(category=>`<span class="admin-chip">${escapeHtml(category.name)}</span>`).join('')}</div><div class="admin-table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>${products.length?products.map(product=>`<tr><td><div class="table-product"><span class="table-art">${renderProductImage(product.image,'admin-product-image')}</span><span><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.condition)}${product.isFeatured?' · Featured':''}</small></span></div></td><td>${escapeHtml(product.category)}</td><td>${product.isSale?`<del>${formatNaira(product.regularPrice)}</del> `:''}${formatNaira(product.price)}</td><td>${product.stock}</td><td><span class="status ${product.isSold||product.stock===0?'out':product.status==='draft'?'new':'in'}">${product.isSold?'Sold':product.status==='draft'?'Draft':product.stock?'In stock':'Out of stock'}</span></td><td><button class="table-btn" data-edit-product="${product.id}">Edit</button><button class="table-btn danger" data-delete-product="${product.id}">Delete</button></td></tr>`).join(''):'<tr><td colspan="6">No products yet. Add a listing to start your catalog.</td></tr>'}</tbody></table></div></section><section id="orders" class="admin-panel"><div class="panel-head"><div><span class="eyebrow">SALES</span><h2>Recent orders</h2></div></div>${orders.length?`<div class="orders-list">${orders.slice(0,30).map(order=>`<article class="order-row"><div><b>${escapeHtml(order.order_number)}</b><span>${escapeHtml(order.customer_name)} · ${escapeHtml(order.customer_phone)}<br>${(order.order_items||[]).map(item=>`${escapeHtml(item.product_name)} × ${item.quantity}`).join(', ')}</span></div><strong>${formatNaira(order.total)}</strong><select class="status-select" data-order-status="${order.id}" aria-label="Update status for ${escapeHtml(order.order_number)}">${orderStatuses.map(status=>`<option ${order.status===status?'selected':''}>${status}</option>`).join('')}</select></article>`).join('')}</div>`:'<div class="empty-state compact"><div class="empty-bag">🛍</div><h3>No orders yet.</h3><p>Customer orders will show here.</p></div>'}</section></section></div>`;
  document.getElementById('logout').onclick=async()=>{await supabaseClient.auth.signOut();renderLogin();};
  document.getElementById('add-product').onclick=()=>openProductForm();
  document.getElementById('add-category').onclick=openCategoryForm;
  adminRoot.querySelectorAll('[data-edit-product]').forEach(button=>button.addEventListener('click',()=>editProduct(button.dataset.editProduct)));
  adminRoot.querySelectorAll('[data-delete-product]').forEach(button=>button.addEventListener('click',()=>deleteProduct(button.dataset.deleteProduct)));
  adminRoot.querySelectorAll('[data-order-status]').forEach(select=>select.addEventListener('change',()=>updateOrderStatus(select.dataset.orderStatus,select.value)));
}

function openCategoryForm(){
  const modal=document.createElement('div');
  modal.className='modal';
  modal.innerHTML='<div class="modal-card"><div class="panel-head"><div><span class="eyebrow">NEW CATEGORY</span><h2>Add a category</h2></div><button type="button" class="close-modal" aria-label="Close">×</button></div><form id="category-form"><label>Category name<input required name="name" maxlength="100" placeholder="Any category"></label><p class="form-error" role="alert"></p><button class="btn btn-primary full" type="submit">Create category</button></form></div>';
  document.body.appendChild(modal);
  modal.querySelector('.close-modal').onclick=()=>modal.remove();
  modal.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();
    const submit=event.currentTarget.querySelector('[type="submit"]');
    const errorBox=event.currentTarget.querySelector('.form-error');
    submit.disabled=true;
    try{
      await ensureCategory(new FormData(event.currentTarget).get('name'));
      modal.remove();
      showToast('Category created.');
      await renderDashboard();
    }catch(error){errorBox.textContent=error.message||'Could not create category.';submit.disabled=false;}
  });
}

function openProductForm(product){
  const modal=document.createElement('div');
  modal.className='modal';
  modal.innerHTML=`<div class="modal-card"><div class="panel-head"><div><span class="eyebrow">${product?'EDIT PRODUCT':'NEW PRODUCT'}</span><h2>${product?'Update listing':'Add a listing'}</h2></div><button type="button" class="close-modal" aria-label="Close">×</button></div><p class="form-hint">Create any category you need and list any kind of product.</p><form id="product-form"><label>Product name<input required name="name" maxlength="200" value="${escapeHtml(product?.name||'')}"></label><label>Category<input required name="category" list="category-list" placeholder="Enter or select any category" value="${escapeHtml(product?.category||'')}"><datalist id="category-list">${getCategories().map(category=>`<option value="${escapeHtml(category)}">`).join('')}</datalist></label><div class="two-col"><label>Price<input required type="number" min="0" step="0.01" name="price" value="${product?.regularPrice??''}"></label><label>Stock<input required type="number" min="0" step="1" name="stock" value="${product?.stock??''}"></label></div><div class="two-col"><label>Condition<input name="condition" maxlength="80" value="${escapeHtml(product?.condition||'New')}"></label><label>Badge<input name="badge" maxlength="60" placeholder="Best seller / New" value="${escapeHtml(product?.badge||'')}"></label></div><label>Sale price<input type="number" min="0" step="0.01" name="salePrice" value="${product?.salePrice??''}" placeholder="Optional"></label><label>Description<textarea required name="description" rows="4" maxlength="10000" placeholder="Tell customers what they are getting...">${escapeHtml(product?.description||'')}</textarea></label><label>Image URLs or emoji, one per line<textarea name="images" rows="3" placeholder="https://… or 📦">${escapeHtml((product?.images||[]).join('\n'))}</textarea></label><label>Upload product images<input type="file" name="uploads" accept="image/jpeg,image/png,image/webp,image/gif" multiple></label><div class="product-options"><label><input type="checkbox" name="featured" ${product?.isFeatured?'checked':''}> Featured</label><label><input type="checkbox" name="sale" ${product?.isSale?'checked':''}> On sale</label><label><input type="checkbox" name="sold" ${product?.isSold?'checked':''}> Sold / unavailable</label></div><label>Listing status<select name="status"><option value="published" ${product?.status==='published'?'selected':''}>Published</option><option value="draft" ${product?.status==='draft'?'selected':''}>Draft</option><option value="archived" ${product?.status==='archived'?'selected':''}>Archived</option></select></label><p class="form-error" role="alert"></p><button class="btn btn-primary full" type="submit">${product?'Save changes':'Publish product'}</button></form></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.close-modal').onclick=()=>modal.remove();
  modal.querySelector('#product-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const submit=form.querySelector('[type="submit"]');
    const errorBox=form.querySelector('.form-error');
    const values=new FormData(form);
    const price=Number(values.get('price'));
    const salePrice=values.get('salePrice')===''?null:Number(values.get('salePrice'));
    if(values.has('sale')&&(salePrice===null||salePrice>=price)){
      errorBox.textContent='Enter a sale price below the regular price.';
      return;
    }
    submit.disabled=true;
    submit.textContent='Saving listing…';
    errorBox.textContent='';
    try{
      const category=await ensureCategory(values.get('category'));
      const uploaded=await uploadProductImages(Array.from(values.getAll('uploads')));
      const imageUrls=String(values.get('images')||'').split('\n').map(image=>image.trim()).filter(Boolean);
      const payload={
        category_id:category.id,
        name:String(values.get('name')).trim(),
        description:String(values.get('description')).trim(),
        condition:String(values.get('condition')||'New').trim()||'New',
        price,
        sale_price:values.has('sale')?salePrice:null,
        stock:Number(values.get('stock')),
        images:[...imageUrls,...uploaded],
        badge:String(values.get('badge')||'').trim(),
        is_featured:values.has('featured'),
        is_sale:values.has('sale'),
        is_sold:values.has('sold'),
        status:String(values.get('status')),
        updated_at:new Date().toISOString()
      };
      const request=product
        ?supabaseClient.from('products').update(payload).eq('id',product.id).select('id').single()
        :supabaseClient.from('products').insert(payload).select('id').single();
      const {error}=await request;
      if(error) throw error;
      modal.remove();
      showToast(product?'Product updated.':'Product published.');
      await renderDashboard();
    }catch(error){
      errorBox.textContent=error.message||'Could not save this product.';
      submit.disabled=false;
      submit.textContent=product?'Save changes':'Publish product';
    }
  });
}

function editProduct(id){
  const product=getProducts().find(item=>item.id===id);
  if(product) openProductForm(product);
}

async function deleteProduct(id){
  if(!confirm('Delete this product?')) return;
  try{
    const {error}=await supabaseClient.from('products').delete().eq('id',id);
    if(error) throw error;
    showToast('Product deleted.');
    await renderDashboard();
  }catch(error){showToast(error.message||'Could not delete this product.');}
}

async function updateOrderStatus(id,status){
  try{
    const {error}=await supabaseClient.from('orders').update({status}).eq('id',id);
    if(error) throw error;
    showToast('Order updated.');
  }catch(error){showToast(error.message||'Could not update this order.');await renderDashboard();}
}

async function initializeAdmin(){
  if(!supabaseClient){
    adminRoot.innerHTML=`<div class="admin-login"><div class="admin-login-card"><span class="eyebrow">BAGGED CONTROL ROOM</span><h1>Connection unavailable.</h1><p class="form-error" role="alert">${escapeHtml(window.supabaseClientError||'The sign-in service could not load. Check your internet connection and retry.')}</p><button id="retry-admin" class="btn btn-primary">Try again</button></div></div>`;
    document.getElementById('retry-admin').onclick=()=>location.reload();
    return;
  }
  try{
    const {data,error}=await supabaseClient.auth.getSession();
    if(error) throw error;
    if(!data.session){renderLogin();return;}
    await requireAdmin(data.session.user);
    await renderDashboard();
  }catch(error){
    await supabaseClient.auth.signOut();
    renderLogin(error.message||'Sign in with an authorized admin account.');
  }
}

initializeAdmin();