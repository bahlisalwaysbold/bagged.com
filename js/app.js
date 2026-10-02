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
function renderHomeCategories(){ const root=document.getElementById('home-categories'); if(!root) return; const cats=getCategories(); const styles=['yellow','black','orange','cream']; root.innerHTML=cats.map((c,i)=>`<a class="category-card ${styles[i%styles.length]}" href="shop.html?category=${encodeURIComponent(c)}"><span>${categoryIcon(c)}</span><strong>${escapeHtml(c)}</strong><small>${escapeHtml(categoryBlurb(c))}</small></a>`).join('') || '<p class="catalog-message">No categories yet. Check back soon.</p>'; }
function productCard(p){ return `<article class="product-card"><a class="product-image" href="product.html?id=${encodeURIComponent(p.id)}">${renderProductImage(p.image)}${p.badge?`<span class="pill">${escapeHtml(p.badge)}</span>`:''}${p.stock<=2?'<span class="low-stock">Low stock</span>':''}</a><div class="product-info"><div class="mini-meta"><span>${escapeHtml(p.category||'General')}</span><span>${escapeHtml(p.condition||'New')}</span></div><h3><a href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a></h3><div class="price-row"><strong>${p.isSale?`<del>${formatNaira(p.regularPrice)}</del> `:''}${formatNaira(p.price)}</strong><button class="mini-bag" onclick="addToCart('${String(p.id).replace(/'/g,"\\'")}')">Bag it</button></div></div></article>`; }
function setupPage(){ updateBagCount(); document.querySelectorAll('.menu-btn').forEach(btn=>btn.addEventListener('click',()=>document.querySelector('.desktop-nav')?.classList.toggle('open'))); }
function finishLoading(){ const loader=document.getElementById('loader'); if(loader) loader.classList.add('hide'); }
function showCatalogError(error){ document.querySelectorAll('#home-categories,#featured-products,#shop-results,#product-root,#cart-root,#checkout-summary').forEach(root=>{if(root) root.innerHTML=`<div class="catalog-message" role="alert">${escapeHtml(error.message||'The shop is temporarily unavailable. Please try again.')}</div>`;}); }
window.addEventListener('bagged:cart-change', updateBagCount);
document.addEventListener('DOMContentLoaded',async()=>{
	setupPage();
	if(document.getElementById('admin-root')) return;
	try{
		await loadCatalog();
		renderHomeCategories();
		const featured=document.getElementById('featured-products');
		if(featured){const products=getProducts();const selected=products.filter(product=>product.isFeatured);featured.innerHTML=(selected.length?selected:products).slice(0,4).map(productCard).join('')||'<p class="catalog-message">No products available yet.</p>';}
	}catch(error){showCatalogError(error);}
	finally{finishLoading();}
});
