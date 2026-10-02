const params=new URLSearchParams(location.search); const preCat=params.get('category')||'';
const search=document.getElementById('search'), category=document.getElementById('category'), sort=document.getElementById('sort'), results=document.getElementById('shop-results'), empty=document.getElementById('empty-state');

function populateCategories(){
  const cats=getCategories();
  category.innerHTML='<option value="">All categories</option>'+cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if(preCat && cats.includes(preCat)) category.value=preCat;
}
function render(){
  let list=getProducts();
  const q=(search.value||'').toLowerCase().trim();
  if(q) list=list.filter(p=>(p.name+' '+p.category+' '+p.description+' '+(p.condition||'')).toLowerCase().includes(q));
  if(category.value) list=list.filter(p=>p.category===category.value);
  if(sort.value==='featured') list.sort((a,b)=>Number(b.isFeatured)-Number(a.isFeatured));
  if(sort.value==='low') list.sort((a,b)=>a.price-b.price);
  if(sort.value==='high') list.sort((a,b)=>b.price-a.price);
  if(sort.value==='new') list=[...list].reverse();
  results.innerHTML=list.map(productCard).join('');
  empty.classList.toggle('hidden',list.length>0);
}

document.addEventListener('DOMContentLoaded',async()=>{
  try{
    await loadCatalog();
    populateCategories();
    [search,category,sort].forEach(el=>el.addEventListener('input',render));
    document.getElementById('clear-search').addEventListener('click',()=>{search.value='';render()});
    render();
  }catch(error){
    results.innerHTML=`<div class="catalog-message" role="alert">${escapeHtml(error.message||'The shop is temporarily unavailable. Please try again.')}</div>`;
    empty.classList.add('hidden');
  }finally{finishLoading();}
});
