import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabaseReady = Boolean(url && anon);

// Kredensial belum diisi -> client null, UI menampilkan peringatan.
export const supabase = supabaseReady ? createClient(url, anon) : null;
