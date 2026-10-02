const catalogState = { products: [], categories: [], loaded: false, adminLoaded: false };
let catalogRequest;

function mapCategory(row){
  return {
    id:row.id,
    name:row.name,
    icon:row.icon||'🛍️',
    description:row.description||''
  };
}

function mapProduct(row){
  const images = row.image_urls?.length ? row.image_urls : (row.images || []);
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    category: row.categories?.name || 'General',
    description: row.description || '',
    condition: row.condition || 'New',
    regularPrice: Number(row.price),
    price: Number(row.is_sale && row.sale_price != null ? row.sale_price : row.price),
    salePrice: row.sale_price == null ? '' : Number(row.sale_price),
    stock: Number(row.stock),
    images,
    imageUrls:images,
    image: images[0] || '📦',
    badge: row.is_sale ? (row.badge || 'Sale') : row.badge,
    isFeatured: row.is_featured,
    isSale: row.is_sale,
    isSold: row.is_sold,
    status: row.status,
    isActive: row.is_active !== false,
    createdAt: row.created_at
  };
}

async function loadCatalog({ admin = false, refresh = false } = {}){
  if(!supabaseClient) throw new Error(window.supabaseClientError||'The shop connection could not load. Reload and try again.');
  if(!refresh && catalogState.loaded && (!admin || catalogState.adminLoaded)) return catalogState;
  if(catalogRequest && !refresh) return catalogRequest;

  catalogRequest = (async()=>{
    const [categoryResult, productResult] = await Promise.all([
      supabaseClient.from('categories').select('id,name,icon,description').order('name'),
      supabaseClient.from('products')
        .select('id,category_id,categories(name),name,description,condition,price,sale_price,stock,images,image_urls,badge,is_featured,is_sale,is_sold,is_active,status,created_at')
        .order('created_at', { ascending: false })
    ]);
    if(categoryResult.error) throw categoryResult.error;
    if(productResult.error) throw productResult.error;
    catalogState.categories = (categoryResult.data || []).map(mapCategory);
    catalogState.products = (productResult.data || []).map(mapProduct);
    catalogState.loaded = true;
    catalogState.adminLoaded = admin;
    return catalogState;
  })();

  try { return await catalogRequest; }
  finally { catalogRequest = null; }
}

function getProducts(){ return catalogState.products; }
function getCategories(){ return catalogState.categories.map(category=>category.name); }

async function ensureCategory(name,{icon='🛍️',description=''}={}){
  const normalized = String(name || '').trim();
  if(!normalized) throw new Error('Enter a category name.');
  const existing = catalogState.categories.find(category=>category.name.toLowerCase()===normalized.toLowerCase());
  if(existing) return existing;
  const { data, error } = await supabaseClient.from('categories')
    .insert({ name: normalized,icon:String(icon||'🛍️').trim(),description:String(description||'').trim() }).select('id,name,icon,description').single();
  if(error) throw error;
  const category=mapCategory(data);
  catalogState.categories.push(category);
  catalogState.categories.sort((a,b)=>a.name.localeCompare(b.name));
  return category;
}

async function uploadProductImages(files){
  const uploaded = [];
  for(const file of files.filter(selected=>selected.name)){
    if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) throw new Error(`${file.name} is not a supported image type.`);
    if(file.size>10485760) throw new Error(`${file.name} exceeds the 10 MB image limit.`);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${crypto.randomUUID()}/${safeName}`;
    const { error } = await supabaseClient.storage.from('product-images').upload(path, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false
    });
    if(error) throw error;
    uploaded.push(supabaseClient.storage.from('product-images').getPublicUrl(path).data.publicUrl);
  }
  return uploaded;
}

async function deleteProductImages(urls){
  const base=`${window.BAGGED_SUPABASE_CONFIG.url}/storage/v1/object/public/product-images/`;
  const paths=urls.filter(url=>String(url).startsWith(base)).map(url=>decodeURIComponent(String(url).slice(base.length)));
  if(!paths.length)return;
  const {error}=await supabaseClient.storage.from('product-images').remove(paths);
  if(error)throw error;
}

async function createOrder(customer, items){
  const { data, error } = await supabaseClient.rpc('create_order', {
    p_customer: customer,
    p_items: items.map(item=>({ id: item.id, quantity: item.qty }))
  });
  if(error) throw error;
  catalogState.loaded = false;
  catalogState.adminLoaded = false;
  return data;
}
