const id=new URLSearchParams(location.search).get('id'); const root=document.getElementById('product-root');
function renderProduct(p){
	const images=p.images.length?p.images:[p.image];
	root.innerHTML=`<div class="crumbs"><a href="shop.html">Shop</a> / ${escapeHtml(p.category||'General')} / ${escapeHtml(p.name)}</div><section class="product-layout"><div class="product-gallery"><div class="main-product-art" id="product-main-image">${renderProductImage(images[0],'product-main-image')}</div><div class="thumb-row">${images.map((image,index)=>`<button type="button" class="product-thumb-button" data-image-index="${index}" aria-label="View product image ${index+1}">${renderProductImage(image,'product-thumb')}</button>`).join('')}</div></div><div class="product-copy">${p.badge?`<span class="pill">${escapeHtml(p.badge)}</span>`:''}<span class="eyebrow">${escapeHtml(p.category.toUpperCase())} · ${escapeHtml(p.condition.toUpperCase())}</span><h1>${escapeHtml(p.name)}</h1><div class="rating">★★★★★ <span>4.8 (24)</span></div><div class="detail-price">${p.isSale?`<del>${formatNaira(p.regularPrice)}</del> `:''}${formatNaira(p.price)}</div><p>${escapeHtml(p.description)}</p><div class="stock-row"><strong>${p.stock} in stock</strong>${p.stock<=2?'<span class="stock-warning">Low stock — bag it now.</span>':''}</div><div class="buy-row"><button class="btn btn-primary" ${p.stock<1?'disabled':''} onclick="addToCart('${p.id}')">Bag it now →</button><a class="btn btn-whatsapp" href="https://wa.me/2348012345678?text=${encodeURIComponent('Hi Bagged, I want the '+p.name)}" target="_blank" rel="noreferrer">WhatsApp</a></div><div class="feature-strip"><span>✓ Secure payment</span><span>✓ Fast delivery</span><span>✓ 7-day support</span></div></div></section><section class="product-lower"><h2>Before you bag it</h2><div class="info-grid"><div><b>Condition</b><span>${escapeHtml(p.condition||'New')}</span></div><div><b>Availability</b><span>${p.stock>0&&!p.isSold?'In stock':'Out of stock'}</span></div><div><b>Category</b><span>${escapeHtml(p.category||'General')}</span></div><div><b>Seller</b><span>Bagged Store</span></div></div></section>`;
	root.querySelectorAll('[data-image-index]').forEach(button=>button.addEventListener('click',()=>{
		root.querySelector('#product-main-image').innerHTML=renderProductImage(images[Number(button.dataset.imageIndex)],'product-main-image');
	}));
}
document.addEventListener('DOMContentLoaded',async()=>{
	try{
		await loadCatalog();
		const product=getProducts().find(item=>item.id===id);
		root.innerHTML=product?'':`<div class="empty-state"><div class="empty-bag">🛍</div><h2>We couldn't find that listing.</h2><p>It may have sold or been removed.</p><a class="btn btn-primary" href="shop.html">Shop everything →</a></div>`;
		if(product) renderProduct(product);
	}catch(error){root.innerHTML=`<div class="catalog-message" role="alert">${escapeHtml(error.message||'The product is temporarily unavailable. Please try again.')}</div>`;}
	finally{finishLoading();}
});
