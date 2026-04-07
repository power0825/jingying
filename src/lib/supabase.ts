import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sgaetrzukdcfzxhystoe.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWV0cnp1a2RjZnp4aHlzdG9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MTM1NjMsImV4cCI6MjA4OTM4OTU2M30.WBpY63I8qh5vQvGCnsP6X-IPWZ4ybAYWrY6AAf_QufA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
