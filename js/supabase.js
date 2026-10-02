let supabaseClient = null;

try{
  if(typeof window.supabase?.createClient!=='function') throw new Error('The Supabase library did not load.');
  if(!window.BAGGED_SUPABASE_CONFIG?.url||!window.BAGGED_SUPABASE_CONFIG?.publishableKey){
    throw new Error('Supabase URL or publishable key is missing.');
  }
  supabaseClient=window.supabase.createClient(
    window.BAGGED_SUPABASE_CONFIG.url,
    window.BAGGED_SUPABASE_CONFIG.publishableKey,
    {
      auth:{
        autoRefreshToken:true,
        persistSession:true,
        detectSessionInUrl:true
      }
    }
  );
  window.supabaseClient=supabaseClient;
}catch(error){
  window.supabaseClientError=error.message||'The shop connection could not initialize. Reload and try again.';
  console.error('Supabase initialization failed:',error);
}