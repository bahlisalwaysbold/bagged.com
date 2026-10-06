const MARKETPLACE_ROLES=['buyer','seller','both'];

async function getMarketplaceRole(){
  if(!window.supabaseClient)return 'buyer';
  try{
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(!session?.user)return 'buyer';
    const {data,error}=await supabaseClient.from('marketplace_preferences').select('role').eq('user_id',session.user.id).maybeSingle();
    if(error)throw error;
    return data?.role || session.user.user_metadata?.marketplace_role || 'buyer';
  }catch(error){
    return 'buyer';
  }
}

async function setMarketplaceRole(role){
  const normalized=String(role||'').toLowerCase();
  if(!MARKETPLACE_ROLES.includes(normalized))throw new Error('Choose buyer, seller, or both.');
  const {data,error}=await supabaseClient.rpc('set_marketplace_role',{p_role:normalized});
  if(error)throw error;
  try{
    await supabaseClient.auth.updateUser({data:{marketplace_role:normalized}});
  }catch{}
  document.body.dataset.marketplaceRole=normalized;
  applyMarketplaceRoleUI(normalized);
  return data||normalized;
}

function applyMarketplaceRoleUI(role){
  const currentRole=MARKETPLACE_ROLES.includes(role)?role:'buyer';
  document.body.dataset.marketplaceRole=currentRole;

  const sellerVisible=currentRole==='seller'||currentRole==='both';
  if(!/seller\.html$/i.test(location.pathname)){
    document.querySelectorAll('a[href="seller.html"]').forEach(el=>{
      if(!el.classList.contains('role-seller-tools'))el.classList.add('role-seller-tools');
    });
  }
  document.querySelectorAll('.role-seller-tools').forEach(el=>{
    el.classList.toggle('role-hidden',!sellerVisible);
    el.setAttribute('aria-hidden',sellerVisible?'false':'true');
  });

  if(currentRole==='buyer' && !/seller\.html$/i.test(location.pathname)){
    document.querySelectorAll('.seller-only-ui').forEach(el=>el.classList.add('role-hidden'));
  }else{
    document.querySelectorAll('.seller-only-ui').forEach(el=>el.classList.remove('role-hidden'));
  }

  const hero=document.querySelector('.marketplace-hero');
  if(hero){
    const eyebrow=hero.querySelector('.eyebrow');
    const title=hero.querySelector('h1');
    const copy=hero.querySelector('.hero-copy>p');
    if(currentRole==='buyer'){
      if(eyebrow)eyebrow.textContent='BUY · DISCOVER';
      if(title)title.innerHTML='Find what you want.<br><span>Bag the deal.</span>';
      if(copy)copy.textContent='Discover phones, laptops, furniture, fashion, cars, services and everything else people are putting on Bagged.';
    }else if(currentRole==='seller'){
      if(eyebrow)eyebrow.textContent='SELL · GROW · DISCOVER';
      if(title)title.innerHTML='Got something?<br><span>Bag it.</span>';
      if(copy)copy.textContent='Put your products in front of Bagged buyers, learn what people want and grow your listings with premium visibility.';
    }else{
      if(eyebrow)eyebrow.textContent='BUY · SELL · DISCOVER';
      if(title)title.innerHTML='Buy anything.<br><span>Sell anything.</span>';
      if(copy)copy.textContent='Bagged is the marketplace for the stuff people actually want — and the place to put your own products in front of buyers.';
    }

    const heroSell=hero.querySelector('.role-seller-tools');
    if(heroSell)heroSell.textContent=currentRole==='seller'?'Post a listing →':'Sell something free';
  }

  const buyerSteps=document.getElementById('buyer-flow-section');
  if(buyerSteps)buyerSteps.classList.toggle('role-buyer-visible',currentRole!=='seller');

  document.querySelectorAll('[data-marketplace-role-link]').forEach(el=>{
    const target=el.dataset.marketplaceRoleLink;
    if(target==='seller')el.href='seller.html';
  });
}

async function setupMarketplaceRoleUI(){
  const role=await getMarketplaceRole();
  applyMarketplaceRoleUI(role);
  return role;
}
const formatNaira = n => '₦' + Number(n).toLocaleString('en-NG');
const getCart = () => { try { return JSON.parse(localStorage.getItem('bagged_cart') || '[]'); } catch { return []; } };
const setCart = cart => { localStorage.setItem('bagged_cart', JSON.stringify(cart)); updateBagCount(); window.dispatchEvent(new Event('bagged:cart-change')); };
function updateBagCount(){ const el=document.getElementById('bag-count'); if(el) el.textContent=getCart().reduce((s,i)=>s+i.qty,0); }
function addToCart(id, qty=1){ const p=getProducts().find(x=>x.id===id); if(!p || p.stock<1){showToast('This item is no longer available.');return;} const cart=getCart(); const item=cart.find(x=>x.id===id); if(item) item.qty=Math.min(item.qty+qty,p.stock); else cart.push({id,qty:Math.min(qty,p.stock)}); setCart(cart); showToast(`${p.name} bagged! 🛍`); }
function removeFromCart(id){setCart(getCart().filter(x=>x.id!==id));}
function changeQty(id, delta){ const cart=getCart(); const item=cart.find(x=>x.id===id); const p=getProducts().find(x=>x.id===id); if(!item||!p) return; item.qty=Math.max(1,Math.min(item.qty+delta,p.stock)); setCart(cart); }
function showToast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); requestAnimationFrame(()=>t.classList.add('show')); setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),250)},2200); }
function escapeHtml(value=''){ return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function renderProductImage(value, className='product-art'){ const v=String(value||'📦'); const looksLikeImage=/^(https?:\/\/|data:image\/)/i.test(v); return looksLikeImage ? `<img class="${className}" src="${escapeHtml(v)}" alt="" loading="lazy">` : `<span class="${className}">${escapeHtml(v)}</span>`; }
function categoryIcon(category=''){ const c=category.toLowerCase(); if(/phone|tablet|mobile/.test(c)) return '📱'; if(/laptop|computer|pc|monitor/.test(c)) return '💻'; if(/game|console|playstation|xbox/.test(c)) return '🎮'; if(/audio|accessor|headphone|earbud|charger/.test(c)) return '🎧'; if(/fashion|cloth|shoe|wear/.test(c)) return '👕'; if(/home|living|furniture|kitchen/.test(c)) return '🏠'; if(/beauty|care|cosmetic/.test(c)) return '✨'; if(/car|auto|vehicle|motor/.test(c)) return '🚗'; if(/book|stationery|school/.test(c)) return '📚'; if(/food|drink|grocery/.test(c)) return '🍽️'; if(/tool|hardware|building/.test(c)) return '🛠️'; return '🛍️'; }
function categoryBlurb(category=''){ const c=category.toLowerCase(); if(/phone|tablet|mobile/.test(c)) return 'Phones, tablets & more'; if(/laptop|computer|pc|monitor/.test(c)) return 'Work, school & power'; if(/game|console|playstation|xbox/.test(c)) return 'Games, consoles & gear'; if(/fashion|cloth|shoe|wear/.test(c)) return 'Style, footwear & more'; if(/home|living|furniture|kitchen/.test(c)) return 'Home essentials & finds'; if(/beauty|care|cosmetic/.test(c)) return 'Beauty & everyday care'; return 'Browse this collection'; }
function renderHomeCategories(){ const root=document.getElementById('home-categories'); if(!root) return; const cats=catalogState.categories; const styles=['yellow','black','orange','cream']; root.innerHTML=cats.map((category,i)=>`<a class="category-card ${styles[i%styles.length]}" href="shop.html?category=${encodeURIComponent(category.name)}"><span>${escapeHtml(category.icon||categoryIcon(category.name))}</span><strong>${escapeHtml(category.name)}</strong><small>${escapeHtml(category.description||categoryBlurb(category.name))}</small></a>`).join('') || '<p class="catalog-message">No categories yet. Check back soon.</p>'; }
function productCard(p){
  const seller=p.seller;
  const sellerLabel=seller ? (seller.verified?'✓ '+seller.name:seller.name) : 'Bagged Store';
  return `<article class="product-card"><a class="product-image" href="product.html?id=${encodeURIComponent(p.id)}">${renderProductImage(p.image)}${p.badge?`<span class="pill">${escapeHtml(p.badge)}</span>`:''}${p.stock<=2?'<span class="low-stock">Low stock</span>':''}</a><div class="product-info"><div class="mini-meta"><span>${escapeHtml(p.category||'General')}</span><span>${escapeHtml(p.condition||'New')}</span></div><h3><a href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a></h3><p class="seller-mini">${escapeHtml(sellerLabel)}</p><div class="price-row"><strong>${p.isSale?`<del>${formatNaira(p.regularPrice)}</del> `:''}${formatNaira(p.price)}</strong><button class="mini-bag" onclick="addToCart('${String(p.id).replace(/'/g,"\\'")}')">Bag it</button></div></div></article>`;
}
function setupPage(){ updateBagCount(); document.querySelectorAll('.menu-btn').forEach(btn=>btn.addEventListener('click',()=>document.querySelector('.desktop-nav')?.classList.toggle('open'))); setupMarketplaceRoleUI(); }
function finishLoading(){ const loader=document.getElementById('loader'); if(loader) loader.classList.add('hide'); }
function showCatalogError(error){ document.querySelectorAll('#home-categories,#featured-products,#shop-results,#product-root,#cart-root,#checkout-summary').forEach(root=>{if(root) root.innerHTML=`<div class="catalog-message" role="alert">${escapeHtml(error.message||'The shop is temporarily unavailable. Please try again.')}</div>`;}); }
window.addEventListener('bagged:cart-change', updateBagCount);
function subscribeToCatalogChanges(){
	if(!supabaseClient||!document.querySelector('#home-categories,#shop-results,#product-root,#cart-root')||window.baggedCatalogChannel)return;
	window.baggedCatalogChannel=supabaseClient.channel('bagged-storefront-catalog')
		.on('postgres_changes',{event:'*',schema:'public',table:'products'},()=>location.reload())
		.on('postgres_changes',{event:'*',schema:'public',table:'categories'},()=>location.reload())
    .on('postgres_changes',{event:'*',schema:'public',table:'seller_profiles'},()=>location.reload())
		.subscribe();
}
document.addEventListener('DOMContentLoaded',async()=>{
	setupPage();
	if(document.getElementById('admin-root')) return;
	if(!document.querySelector('#home-categories,#shop-results,#product-root,#cart-root,#checkout-summary')) return;
	subscribeToCatalogChanges();
	try{
		await loadCatalog();
		renderHomeCategories();
		const featured=document.getElementById('featured-products');
		if(featured){const products=getProducts();const selected=products.filter(product=>product.isFeatured);featured.innerHTML=(selected.length?selected:products).slice(0,4).map(productCard).join('')||'<p class="catalog-message">No products available yet.</p>';}
	}catch(error){showCatalogError(error);}
	finally{finishLoading();}
});
