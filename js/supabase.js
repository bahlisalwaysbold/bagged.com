const supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(
      window.BAGGED_SUPABASE_CONFIG.url,
      window.BAGGED_SUPABASE_CONFIG.publishableKey,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      }
    )
  : null;

if(!supabaseClient){
  window.supabaseClientError='The shop connection could not load. Check your internet connection and reload.';
  console.error(window.supabaseClientError);
}else{
  window.supabaseClient = supabaseClient;
}