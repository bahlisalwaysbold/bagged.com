(function(){
  const KEY='bagged_visitor_id';
  const getVisitorId=()=>{
    if(window.BaggedPrivacy?.hasConsent && !window.BaggedPrivacy.hasConsent())return null;
    const cookieId=window.BaggedPrivacy?.getVisitorId?.();
    if(cookieId)return cookieId;
    try{return localStorage.getItem(KEY)||null;}catch{return null;}
  };

  const recentKey=(type,value)=>'bagged_event_'+type+'_'+String(value||'').slice(0,80);
  const shouldTrack=(type,value,windowMs=120000)=>{
    try{
      const key=recentKey(type,value);
      const last=Number(sessionStorage.getItem(key)||0);
      if(Date.now()-last<windowMs)return false;
      sessionStorage.setItem(key,String(Date.now()));
      return true;
    }catch{return true;}
  };

  async function trackMarketplaceEvent(type,{productId=null,categoryId=null,searchTerm=null,throttleValue=''}={}){
    if(!window.supabaseClient || (window.BaggedPrivacy?.hasConsent && !window.BaggedPrivacy.hasConsent()) || !getVisitorId() || !shouldTrack(type,throttleValue||productId||searchTerm||'generic'))return;
    try{
      await supabaseClient.rpc('record_marketplace_event',{
        p_visitor_id:getVisitorId(),
        p_event_type:type,
        p_product_id:productId,
        p_category_id:categoryId,
        p_search_term:searchTerm
      });
    }catch(error){
      console.debug('Bagged analytics skipped',error);
    }
  }

  async function getDiscovery(){
    if(!window.supabaseClient)return {};
    try{
      const {data:{session}}=await supabaseClient.auth.getSession();
      const consent=window.BaggedPrivacy?.consent?.()||'unknown';
      const allowed=consent==='accepted';
      const {data,error}=await supabaseClient.rpc('get_marketplace_discovery',{
        p_user_id:allowed?(session?.user?.id||null):null,
        p_visitor_id:allowed?getVisitorId():null
      });
      if(error)throw error;
      return data||{};
    }catch(error){
      console.debug('Bagged discovery unavailable',error);
      return {};
    }
  }

  function orderedProducts(ids){
    const products=getProducts();
    const order=Array.isArray(ids)?ids:[];
    return order.map(id=>products.find(p=>p.id===id)).filter(Boolean);
  }

  function renderDiscovery(){
    const seen=new Set();
    const sections=[
      ['boosted-products',orderedProducts(window.baggedDiscovery?.boosted_ids)],
      ['trending-products',orderedProducts(window.baggedDiscovery?.trending_ids)],
      ['personalized-products',orderedProducts(window.baggedDiscovery?.personalized_ids)],
      ['fresh-products',orderedProducts(window.baggedDiscovery?.fresh_ids)]
    ];

    sections.forEach(([id,items])=>{
      const root=document.getElementById(id);
      if(!root)return;
      const unique=items.filter(item=>{
        const key=String(item.id);
        if(seen.has(key))return false;
        seen.add(key);
        return true;
      }).slice(0,4);
      root.innerHTML=unique.map(productCard).join('');
    });

    const terms=Array.isArray(window.baggedDiscovery?.trending_terms)?window.baggedDiscovery.trending_terms:[];
    const termsRoot=document.getElementById('trending-terms');
    if(termsRoot){
      termsRoot.innerHTML=terms.length
        ?terms.slice(0,6).map(item=>'<a class="trend-chip" href="shop.html?search='+encodeURIComponent(item.term)+'">🔥 '+escapeHtml(item.term)+'</a>').join('')
        :'<span class="trend-chip muted">Trending will appear as Bagged gets busier.</span>';
    }

    ['boosted-products','trending-products','personalized-products','fresh-products'].forEach(id=>{
      const root=document.getElementById(id);
      const section=root?.closest('.discovery-section');
      if(section)section.classList.toggle('hidden',!root?.children.length);
    });
  }

  async function loadHomepageDiscovery(){
    if(!document.getElementById('boosted-products'))return;
    window.baggedDiscovery=await getDiscovery();
    renderDiscovery();
  }

  async function refreshDiscovery(){
    if(document.getElementById('boosted-products'))await loadHomepageDiscovery();
  }

  window.BaggedDiscovery={
    getVisitorId,
    trackMarketplaceEvent,
    loadHomepageDiscovery,
    getDiscovery,
    refreshDiscovery
  };
})();