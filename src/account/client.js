/* client: split out of account.js */

import { createClient } from '@supabase/supabase-js';

export const URL = import.meta.env.VITE_SUPABASE_URL ?? '';

export const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
/** Whether this build was given a backend at all. */

export const configured = Boolean(URL && ANON_KEY);

export const supabase = configured
  ? createClient(URL, ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The WebView has no address bar to carry a token back in.
        detectSessionInUrl: false,
        storageKey: 'wikster.auth'
      }
    })
  : null;

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
