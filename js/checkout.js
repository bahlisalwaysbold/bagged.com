const summary=document.getElementById('checkout-summary');
const form=document.getElementById('checkout-form');
summary.innerHTML='<p class="catalog-message" role="status">Loading your order summary…</p>';
form.querySelector('[type="submit"]').disabled=true;
function summaryRender(items){
	const total=items.reduce((sum,item)=>sum+item.product.price*item.qty,0);
	summary.innerHTML=`<span class="eyebrow">ORDER SUMMARY</span><h2>${items.length} item${items.length===1?'':'s'}</h2>${items.map(item=>`<div class="sum-line"><span>${escapeHtml(item.product.name)} × ${item.qty}</span><strong>${formatNaira(item.product.price*item.qty)}</strong></div>`).join('')}<div class="sum-total"><span>Total</span><strong>${formatNaira(total)}</strong></div>`;
}
form.addEventListener('submit',async event=>{
	event.preventDefault();
	const submit=form.querySelector('[type="submit"]');
	const message=document.getElementById('checkout-message');
	const items=getCart();
	if(!items.length){message.textContent='Your bag is empty.';return;}
	submit.disabled=true;
	submit.textContent='Placing your order…';
	message.textContent='';
	try{
		const values=new FormData(form);
		const customer={
			name:String(values.get('name')).trim(),
			phone:String(values.get('phone')).trim(),
			email:String(values.get('email')).trim(),
			address:String(values.get('address')).trim(),
			payment:String(values.get('payment')).trim()
		};
		const order=await createOrder(customer,items);
		const catalogProducts=getProducts();
		items.forEach(item=>{
			const product=catalogProducts.find(product=>product.id===item.id);
			window.BaggedDiscovery?.trackMarketplaceEvent('purchase',{
				productId:item.id,
				categoryId:product?.categoryId||null,
				throttleValue:'purchase:'+order.id+':'+item.id
			});
		});
		setCart([]);
		document.querySelector('.checkout-grid').innerHTML=`<div class="success-card"><div class="success-icon">🛍</div><span class="eyebrow">ORDER CONFIRMED</span><h1>Your order is bagged! 🎉</h1><p>Order <strong>${escapeHtml(order.order_number)}</strong> has been received. The store owner can now process your delivery.</p><div class="hero-actions"><a class="btn btn-primary" href="shop.html">Bag more stuff</a><a class="btn btn-secondary" href="index.html">Back home</a></div></div>`;
	}catch(error){
		message.textContent=error.message||'We could not place your order. Please try again.';
		submit.disabled=false;
		submit.textContent='Bag it now →';
	}
});
document.addEventListener('DOMContentLoaded',async()=>{
	try{
		await loadCatalog();
		const products=getProducts();
		const items=getCart().map(item=>({ ...item, product:products.find(product=>product.id===item.id) })).filter(item=>item.product);
		if(items.length!==getCart().length){
			summary.innerHTML='<p class="catalog-message" role="alert">Some items in your bag are no longer available. Return to your bag to remove them before checkout.</p><a class="btn btn-secondary" href="cart.html">Review your bag</a>';
			form.querySelector('[type="submit"]').disabled=true;
			return;
		}
		if(!items.length){
			summary.innerHTML='<p>Your bag is empty. <a href="shop.html">Go shop.</a></p>';
			form.querySelector('[type="submit"]').disabled=true;
		}else summaryRender(items);
		form.querySelector('[type="submit"]').disabled=!items.length;
	}catch(error){
		summary.innerHTML=`<div class="catalog-message" role="alert">${escapeHtml(error.message||'Checkout is temporarily unavailable. Please try again.')}</div>`;
		form.querySelector('[type="submit"]').disabled=true;
	}finally{finishLoading();}
});
