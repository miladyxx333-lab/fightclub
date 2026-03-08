
-- ============================================
-- KILLPOLLO P2P ARENA — Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Enable Realtime for the arena
-- (Go to Supabase Dashboard → Database → Replication → Enable for arena_fights)

-- 2. Arena Fights Table
CREATE TABLE public.arena_fights (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  
  -- Creator info
  creator_wallet TEXT NOT NULL,
  creator_username TEXT,
  creator_fighter_id TEXT NOT NULL,
  creator_fighter_name TEXT,
  creator_fighter_image TEXT,
  
  -- Challenger info (null until someone joins)
  challenger_wallet TEXT,
  challenger_username TEXT,
  challenger_fighter_id TEXT,
  challenger_fighter_name TEXT,
  challenger_fighter_image TEXT,
  
  -- Bet details
  token_mint TEXT NOT NULL,           -- SPL token mint or 'SOL' for native SOL
  token_symbol TEXT NOT NULL,         -- e.g. "BONK", "SOL"
  token_name TEXT,
  token_decimals INT DEFAULT 9,
  bet_amount BIGINT NOT NULL,         -- Amount in smallest unit (lamports)
  bet_amount_display TEXT,            -- Human-readable "100 BONK"
  
  -- Fight state
  status TEXT DEFAULT 'waiting',      -- waiting | active | resolving | completed | cancelled | expired
  winner_wallet TEXT,
  winner_role TEXT,                    -- 'creator' | 'challenger'
  
  -- Escrow tracking
  creator_deposit_tx TEXT,
  challenger_deposit_tx TEXT,
  payout_tx TEXT,
  
  -- Fee
  fee_percentage NUMERIC DEFAULT 3.0,
  fee_amount BIGINT DEFAULT 0,
  
  -- Combat state (stored for reconnection)
  combat_state JSONB,
  current_turn TEXT DEFAULT 'creator', -- whose turn: 'creator' | 'challenger'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '15 minutes')
);

-- Indexes
CREATE INDEX idx_arena_fights_status ON arena_fights(status);
CREATE INDEX idx_arena_fights_token ON arena_fights(token_mint);
CREATE INDEX idx_arena_fights_creator ON arena_fights(creator_wallet);
CREATE INDEX idx_arena_fights_created ON arena_fights(created_at DESC);

-- Enable RLS
ALTER TABLE arena_fights ENABLE ROW LEVEL SECURITY;

-- Everyone can read fights (lobby)
CREATE POLICY "Fights are viewable by everyone"
  ON arena_fights FOR SELECT USING (true);

-- Allow inserts (for creating fights)
CREATE POLICY "Anyone can create fights"
  ON arena_fights FOR INSERT WITH CHECK (true);

-- Allow updates (for joining, resolving)
CREATE POLICY "Anyone can update fights"
  ON arena_fights FOR UPDATE USING (true);


-- 3. Arena History Table
CREATE TABLE public.arena_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  fight_id UUID REFERENCES arena_fights(id),
  wallet TEXT NOT NULL,
  role TEXT NOT NULL,                  -- 'creator' or 'challenger'
  fighter_id TEXT NOT NULL,
  fighter_name TEXT,
  result TEXT NOT NULL,                -- 'win' or 'loss'
  amount_wagered BIGINT NOT NULL,
  amount_won BIGINT DEFAULT 0,
  token_mint TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_arena_history_wallet ON arena_history(wallet);
CREATE INDEX idx_arena_history_created ON arena_history(created_at DESC);

ALTER TABLE arena_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "History is viewable by everyone"
  ON arena_history FOR SELECT USING (true);

CREATE POLICY "Anyone can insert history"
  ON arena_history FOR INSERT WITH CHECK (true);


-- 4. Enable Realtime on arena_fights
-- NOTE: You also need to enable this in the Supabase Dashboard:
-- Database → Replication → Toggle ON for arena_fights
ALTER PUBLICATION supabase_realtime ADD TABLE arena_fights;
