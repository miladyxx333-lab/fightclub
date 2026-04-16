
-- ============================================
-- MIGRATION: Wallet-Based Auth for CyberPollo Arena
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Add wallet_address column to existing game_users table
ALTER TABLE public.game_users 
  ADD COLUMN IF NOT EXISTS wallet_address TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_nonce TEXT,
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- 2. Make username and password optional (they were required before)
ALTER TABLE public.game_users ALTER COLUMN username DROP NOT NULL;
ALTER TABLE public.game_users ALTER COLUMN password DROP NOT NULL;

-- 3. Create index for fast wallet lookups
CREATE INDEX IF NOT EXISTS idx_game_users_wallet ON public.game_users(wallet_address);

-- 4. New RPC: Upsert user by wallet (create if not exists, update if exists)
CREATE OR REPLACE FUNCTION wallet_login(p_wallet TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user record;
  v_nonce TEXT;
BEGIN
  -- Generate a fresh nonce
  v_nonce := encode(gen_random_bytes(32), 'hex');

  -- Try to find existing user
  SELECT * INTO v_user FROM public.game_users WHERE wallet_address = p_wallet;

  IF FOUND THEN
    -- Update nonce and last_login
    UPDATE public.game_users 
    SET auth_nonce = v_nonce, last_login = now()
    WHERE wallet_address = p_wallet;

    RETURN json_build_object(
      'id', v_user.id,
      'wallet_address', v_user.wallet_address,
      'credits', v_user.credits,
      'nonce', v_nonce,
      'is_new', false
    );
  ELSE
    -- Create new user with wallet
    INSERT INTO public.game_users (wallet_address, username, credits, auth_nonce)
    VALUES (p_wallet, p_wallet, 100, v_nonce)
    RETURNING * INTO v_user;

    RETURN json_build_object(
      'id', v_user.id,
      'wallet_address', v_user.wallet_address,
      'credits', v_user.credits,
      'nonce', v_nonce,
      'is_new', true
    );
  END IF;
END;
$$;

-- 5. New RPC: Add credits (wallet-based, no password needed)
CREATE OR REPLACE FUNCTION add_credits_wallet(p_wallet TEXT, p_amount BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.game_users
  SET credits = credits + p_amount
  WHERE wallet_address = p_wallet;

  RETURN FOUND;
END;
$$;

-- 6. New RPC: Deduct credits (wallet-based, with balance check)
CREATE OR REPLACE FUNCTION deduct_credits_wallet(p_wallet TEXT, p_amount BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credits BIGINT;
BEGIN
  SELECT credits INTO v_credits FROM public.game_users WHERE wallet_address = p_wallet;

  IF NOT FOUND OR v_credits < p_amount THEN
    RETURN FALSE;
  END IF;

  UPDATE public.game_users
  SET credits = credits - p_amount
  WHERE wallet_address = p_wallet;

  RETURN TRUE;
END;
$$;

-- 7. Grant execute permissions on new functions
GRANT EXECUTE ON FUNCTION wallet_login(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION add_credits_wallet(TEXT, BIGINT) TO anon;
GRANT EXECUTE ON FUNCTION deduct_credits_wallet(TEXT, BIGINT) TO anon;
