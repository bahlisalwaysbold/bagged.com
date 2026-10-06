const BAGGED_PRIVACY_CONSENT_KEY='bagged_privacy_consent';
const BAGGED_VISITOR_COOKIE='bagged_visitor_id';

function baggedCookieGet(name){
  const match=document.cookie.split('; ').find(row=>row.startsWith(name+'='));
  return match?decodeURIComponent(match.slice(name.length+1)):null;
}
function baggedCookieSet(name,value,maxAgeSeconds=31536000){
  document.cookie=name+'='+encodeURIComponent(value)+'; Max-Age='+maxAgeSeconds+'; Path=/; SameSite=Lax';
}
function baggedCookieDelete(name){
  document.cookie=name+'=; Max-Age=0; Path=/; SameSite=Lax';
}
function baggedConsent(){
  try{return localStorage.getItem(BAGGED_PRIVACY_CONSENT_KEY)||'unknown';}catch{return 'unknown';}
}
function baggedSetConsent(value){
  try{localStorage.setItem(BAGGED_PRIVACY_CONSENT_KEY,value);}catch{}
  if(value==='accepted'){
    let visitor=baggedCookieGet(BAGGED_VISITOR_COOKIE);
    if(!visitor){
      try{visitor=localStorage.getItem('bagged_visitor_id')||null;}catch{}
    }
    if(!visitor)visitor=crypto.randomUUID?crypto.randomUUID():(Date.now().toString(36)+Math.random().toString(36).slice(2));
    baggedCookieSet(BAGGED_VISITOR_COOKIE,visitor);
    try{localStorage.setItem('bagged_visitor_id',visitor);}catch{}
  }else{
    baggedCookieDelete(BAGGED_VISITOR_COOKIE);
    try{localStorage.removeItem('bagged_visitor_id');}catch{}
  }
  document.getElementById('cookie-consent')?.remove();
  if(window.BaggedDiscovery)window.BaggedDiscovery.refreshDiscovery?.();
}
function showBaggedCookieConsent(){
  if(baggedConsent()!=='unknown')return;
  const banner=document.createElement('aside');
  banner.id='cookie-consent';
  banner.className='cookie-consent';
  banner.setAttribute('aria-label','Privacy and personalization settings');
  banner.innerHTML='<div><strong>🍪 Your Bagged experience.</strong><p>Bagged can use a small first-party identifier to remember your activity and personalize recommendations. It is optional.</p></div><div class="cookie-consent-actions"><button type="button" class="btn btn-dark" data-cookie-decline>No thanks</button><button type="button" class="btn btn-primary" data-cookie-accept>Allow personalization</button></div>';
  document.body.appendChild(banner);
  banner.querySelector('[data-cookie-accept]').onclick=()=>baggedSetConsent('accepted');
  banner.querySelector('[data-cookie-decline]').onclick=()=>baggedSetConsent('declined');
}

window.BaggedPrivacy={
  consent:baggedConsent,
  hasConsent:()=>baggedConsent()==='accepted',
  setConsent:baggedSetConsent,
  getVisitorId:()=>{
    if(baggedConsent()!=='accepted')return null;
    let visitor=baggedCookieGet(BAGGED_VISITOR_COOKIE);
    if(!visitor){
      try{visitor=localStorage.getItem('bagged_visitor_id')||null;}catch{}
    }
    if(visitor)baggedCookieSet(BAGGED_VISITOR_COOKIE,visitor);
    return visitor;
  }
};

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
const SAVED_KEY='bagged_saved_products';
function getSavedProductIds(){
  try{return JSON.parse(localStorage.getItem(SAVED_KEY)||'[]').filter(Boolean);}
  catch{return [];}
}
function isSavedProduct(id){return getSavedProductIds().includes(String(id));}
function toggleSavedProduct(id){
  const key=String(id);
  const saved=getSavedProductIds();
  const next=saved.includes(key)?saved.filter(item=>item!==key):[...saved,key];
  try{localStorage.setItem(SAVED_KEY,JSON.stringify(next));}catch{}
  const savedNow=next.includes(key);
  document.querySelectorAll('[data-save-product]').forEach(button=>{
    if(button.dataset.saveProduct!==key)return;
    button.textContent=savedNow?'♥':'♡';
    button.setAttribute('aria-label',savedNow?'Remove from saved':'Save this listing');
    button.setAttribute('aria-pressed',savedNow?'true':'false');
  });
  const product=getProducts().find(item=>String(item.id)===key);
  if(savedNow)window.BaggedDiscovery?.trackMarketplaceEvent('save',{productId:product?.id,categoryId:product?.categoryId,throttleValue:'save_'+key});
  showToast(savedNow?'Saved to your finds. ♥':'Removed from saved.');
}
function getSavedProducts(){
  const saved=new Set(getSavedProductIds());
  return getProducts().filter(product=>saved.has(String(product.id)));
}

const BAGGED_PENDING_BAG_KEY='bagged_pending_bag_action';
const setCart = cart => { localStorage.setItem('bagged_cart', JSON.stringify(cart)); updateBagCount(); window.dispatchEvent(new Event('bagged:cart-change')); };
function updateBagCount(){ const el=document.getElementById('bag-count'); if(el) el.textContent=getCart().reduce((s,i)=>s+i.qty,0); }
function baggedAccountUrl(next){
  const params=new URLSearchParams({mode:'signin'});
  if(next)params.set('next',next);
  return 'account.html?'+params.toString();
}
async function requireSignedIn(next){
  if(!window.supabaseClient){window.location.href=baggedAccountUrl(next);return false;}
  try{
    const {data,error}=await supabaseClient.auth.getSession();
    if(error||!data?.session?.user){
      window.location.href=baggedAccountUrl(next);
      return false;
    }
    return true;
  }catch{
    window.location.href=baggedAccountUrl(next);
    return false;
  }
}
function storePendingBagAction(id,qty=1){
  try{localStorage.setItem(BAGGED_PENDING_BAG_KEY,JSON.stringify({id:String(id),qty:Number(qty)||1}));}catch{}
}
function clearPendingBagAction(){
  try{localStorage.removeItem(BAGGED_PENDING_BAG_KEY);}catch{}
}
async function completePendingBagAction(){
  try{
    const raw=localStorage.getItem(BAGGED_PENDING_BAG_KEY);
    if(!raw)return false;
    const pending=JSON.parse(raw);
    if(!pending?.id){clearPendingBagAction();return false;}
    clearPendingBagAction();
    const p=getProducts().find(x=>String(x.id)===String(pending.id));
    if(!p||p.stock<1){showToast('That item is no longer available.');return false;}
    const cart=getCart();
    const qty=Math.max(1,Math.min(Number(pending.qty)||1,p.stock));
    const item=cart.find(x=>x.id===p.id);
    if(item)item.qty=Math.min(item.qty+qty,p.stock);
    else cart.push({id:p.id,qty});
    setCart(cart);
    showToast(p.name+' bagged! 🛍');
    return true;
  }catch{return false;}
}
async function addToCart(id, qty=1){
  const next=location.pathname.split('/').pop()+(location.search||'');
  if(!(await requireSignedIn(next))){storePendingBagAction(id,qty);return;}
  const p=getProducts().find(x=>x.id===id);
  if(!p || p.stock<1){showToast('This item is no longer available.');return;}
  const cart=getCart();
  const item=cart.find(x=>x.id===id);
  if(item)item.qty=Math.min(item.qty+qty,p.stock);
  else cart.push({id,qty:Math.min(qty,p.stock)});
  setCart(cart);
  showToast(p.name+' bagged! 🛍');
}
function removeFromCart(id){setCart(getCart().filter(x=>x.id!==id));}
function changeQty(id, delta){ const cart=getCart(); const item=cart.find(x=>x.id===id); const p=getProducts().find(x=>x.id===id); if(!item||!p) return; item.qty=Math.max(1,Math.min(item.qty+delta,p.stock)); setCart(cart); }
function showToast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); requestAnimationFrame(()=>t.classList.add('show')); setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),250)},2200); }
function escapeHtml(value=''){ return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function renderProductImage(value, className='product-art'){ const v=String(value||'📦'); const looksLikeImage=/^(https?:\/\/|data:image\/)/i.test(v); return looksLikeImage ? `<img class="${className} image-loading" src="${escapeHtml(v)}" alt="" loading="lazy" decoding="async">` : `<span class="${className}">${escapeHtml(v)}</span>`; }
document.addEventListener('load',event=>{ if(event.target instanceof HTMLImageElement) event.target.classList.remove('image-loading'); },true);

function categoryIcon(category=''){ const c=category.toLowerCase(); if(/phone|tablet|mobile/.test(c)) return '📱'; if(/laptop|computer|pc|monitor/.test(c)) return '💻'; if(/game|console|playstation|xbox/.test(c)) return '🎮'; if(/audio|accessor|headphone|earbud|charger/.test(c)) return '🎧'; if(/fashion|cloth|shoe|wear/.test(c)) return '👕'; if(/home|living|furniture|kitchen/.test(c)) return '🏠'; if(/beauty|care|cosmetic/.test(c)) return '✨'; if(/car|auto|vehicle|motor/.test(c)) return '🚗'; if(/book|stationery|school/.test(c)) return '📚'; if(/food|drink|grocery/.test(c)) return '🍽️'; if(/tool|hardware|building/.test(c)) return '🛠️'; return '🛍️'; }
function categoryBlurb(category=''){ const c=category.toLowerCase(); if(/phone|tablet|mobile/.test(c)) return 'Phones, tablets & more'; if(/laptop|computer|pc|monitor/.test(c)) return 'Work, school & power'; if(/game|console|playstation|xbox/.test(c)) return 'Games, consoles & gear'; if(/fashion|cloth|shoe|wear/.test(c)) return 'Style, footwear & more'; if(/home|living|furniture|kitchen/.test(c)) return 'Home essentials & finds'; if(/beauty|care|cosmetic/.test(c)) return 'Beauty & everyday care'; return 'Browse this collection'; }
function renderHomeCategories(){ const root=document.getElementById('home-categories'); if(!root) return; const cats=catalogState.categories; const styles=['yellow','black','orange','cream']; root.innerHTML=cats.map((category,i)=>`<a class="category-card ${styles[i%styles.length]}" href="shop.html?category=${encodeURIComponent(category.name)}"><span>${escapeHtml(category.icon||categoryIcon(category.name))}</span><strong>${escapeHtml(category.name)}</strong><small>${escapeHtml(category.description||categoryBlurb(category.name))}</small></a>`).join('') || '<p class="catalog-message">No categories yet. Check back soon.</p>'; }
function renderHomepageProducts(){
  const root=document.getElementById('homepage-products');
  const section=document.getElementById('live-marketplace-section');
  if(!root)return;
  const candidates=getProducts().filter(product=>product.isActive&&!product.isSold&&product.stock>0);
  const sellerCounts=new Map();
  const items=[];
  for(const product of candidates){
    const sellerKey=String(product.sellerId||'bagged-store');
    const count=sellerCounts.get(sellerKey)||0;
    if(count>=2)continue;
    sellerCounts.set(sellerKey,count+1);
    items.push(product);
    if(items.length>=8)break;
  }
  root.innerHTML=items.map(productCard).join('');
  section?.classList.toggle('hidden',!items.length);
}
function productCard(p){
  const seller=p.seller;
  const sellerLabel=seller ? (seller.verified?'✓ '+seller.name:seller.name) : 'Bagged Store';
  const sellerLocation=seller?.location||'';
  const saved=isSavedProduct(p.id);
  const badge=String(p.badge||'').trim();
  const stockLabel=p.stock<=2?'Low stock':'';
  const fashion=/fashion|cloth|shoe|wear/i.test(String(p.category||''));
  const photoClass=fashion?'product-art object-top':'product-art';
  return `<article class="product-card"><a class="product-image" href="product.html?id=${encodeURIComponent(p.id)}">${renderProductImage(p.image,photoClass)}<span class="listing-flags" aria-hidden="true"><span class="listing-flags-left">${badge?`<span class="pill">${escapeHtml(badge)}</span>`:''}</span><span class="listing-flags-right">${stockLabel?`<span class="low-stock">${stockLabel}</span>`:''}</span></span></a><div class="product-info"><div class="mini-meta"><span class="mini-category">${escapeHtml(p.category||'General')}</span><span class="mini-condition">${escapeHtml(p.condition||'New')}</span></div><h3><a href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a></h3><p class="seller-mini">${escapeHtml(sellerLabel)}${sellerLocation?' · '+escapeHtml(sellerLocation):''}</p><div class="price-row"><strong>${p.isSale?`<del>${formatNaira(p.regularPrice)}</del> `:''}${formatNaira(p.price)}</strong><div class="product-card-actions"><button class="save-product" type="button" data-save-product="${escapeHtml(p.id)}" aria-label="${saved?'Remove from saved':'Save this listing'}" aria-pressed="${saved?'true':'false'}" onclick="toggleSavedProduct('${String(p.id).replace(/'/g,"\\'")}')">${saved?'♥':'♡'}</button><button class="mini-bag" onclick="addToCart('${String(p.id).replace(/'/g,"\\'")}')">Bag it</button></div></div></div></article>`;
}
function setupPage(){
  updateBagCount();
  document.querySelectorAll('.menu-btn').forEach(btn=>btn.addEventListener('click',()=>document.querySelector('.desktop-nav')?.classList.toggle('open')));
  const homeSearch=document.getElementById('home-search');
  const homeSearchInput=document.getElementById('home-search-input');
  homeSearch?.addEventListener('submit',event=>{
    const value=(homeSearchInput?.value||'').trim();
    if(!value){event.preventDefault();homeSearchInput?.focus();return;}
    window.BaggedDiscovery?.trackMarketplaceEvent('search',{searchTerm:value,throttleValue:value.toLowerCase()});
  });
  setupMarketplaceRoleUI();
  showBaggedCookieConsent();
}
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
    await completePendingBagAction();
		renderHomeCategories();
		renderHomepageProducts();
		await window.BaggedDiscovery?.loadHomepageDiscovery?.();
		const featured=document.getElementById('featured-products');
		if(featured){const products=getProducts();const selected=products.filter(product=>product.isFeatured);featured.innerHTML=(selected.length?selected:products).slice(0,4).map(productCard).join('')||'<p class="catalog-message">No products available yet.</p>';}
	}catch(error){showCatalogError(error);}
	finally{finishLoading();}
});
