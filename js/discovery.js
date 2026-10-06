(function(){
  const KEY='bagged_visitor_id';
  const getVisitorId=()=>{
    try{
      let id=localStorage.getItem(KEY);
      if(!id){
        id=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2))+Date.now().toString(36);
        localStorage.setItem(KEY,id);
      }
      return id;
    }catch{return 'guest-'+Date.now().toString(36);}
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
    if(!window.supabaseClient || !shouldTrack(type,throttleValue||productId||searchTerm||'generic'))return;
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
      const {data,error}=await supabaseClient.rpc('get_marketplace_discovery',{
        p_user_id:session?.user?.id||null,
        p_visitor_id:getVisitorId()
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
    const boosted=orderedProducts(window.baggedDiscovery?.boosted_ids);
    const trending=orderedProducts(window.baggedDiscovery?.trending_ids);
    const personalized=orderedProducts(window.baggedDiscovery?.personalized_ids);
    const fresh=orderedProducts(window.baggedDiscovery?.fresh_ids);

    const sets=[
      ['boosted-products',boosted],
      ['trending-products',trending],
      ['personalized-products',personalized],
      ['fresh-products',fresh]
    ];

    sets.forEach(([id,items])=>{
      const root=document.getElementById(id);
      if(root)root.innerHTML=items.slice(0,4).map(productCard).join('');
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

  window.BaggedDiscovery={
    getVisitorId,
    trackMarketplaceEvent,
    loadHomepageDiscovery,
    getDiscovery
  };
})();