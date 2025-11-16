import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from './environments/environment';

// --- IMPORTANT SECURITY NOTICE ---
// You MUST configure Row Level Security (RLS) policies on your Supabase tables.
// Without RLS, your data is publicly accessible.
//
// Example SQL for setting up tables and RLS policies:
/*
-- 1. CHANNELS TABLE
-- Stores the voice channels.
CREATE TABLE public.channels (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- RLS Policy: Authenticated users can read all channels.
CREATE POLICY "Allow authenticated read access to channels"
ON public.channels
FOR SELECT
TO authenticated
USING (true);


-- 2. CHANNEL_MEMBERS TABLE
-- Tracks which user is in which channel (presence).
CREATE TABLE public.channel_members (
  channel_id bigint NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, user_id)
);

-- Enable Realtime on channel_members table
ALTER TABLE public.channel_members REPLICA IDENTITY FULL;
-- Send realtime messages for inserts and deletes
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_members;


-- RLS Policy: Allow users to view members of any channel.
CREATE POLICY "Allow read access to all members"
ON public.channel_members
FOR SELECT
TO authenticated
USING (true);

-- RLS Policy: Users can only add/remove themselves from a channel.
CREATE POLICY "Allow user to manage their own membership"
ON public.channel_members
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

*/

export const supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
