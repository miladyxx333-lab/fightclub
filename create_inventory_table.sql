-- Table to track which Pollo IDs are owned by which user
CREATE TABLE IF NOT EXISTS public.user_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT NOT NULL,
    pollo_id INTEGER NOT NULL,
    obtained_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    obtained_via TEXT DEFAULT 'purchase', -- 'purchase', 'drop', 'mint'
    
    -- Ensure a user can own multiple pollos, but each entry is unique per pollo_id for that user? 
    -- Actually, a pollo_id is unique across the whole collection (0-9999).
    -- If we want true ownership, a pollo_id should only have ONE owner.
    UNIQUE(pollo_id) 
);

-- Index for fast lookup by wallet
CREATE INDEX IF NOT EXISTS idx_user_inventory_wallet ON public.user_inventory(wallet_address);

-- Enable RLS
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own inventory" 
ON public.user_inventory FOR SELECT 
USING (auth.uid()::text = wallet_address);

-- Functions to handle rewards with NFT bonus
CREATE OR REPLACE FUNCTION public.calculate_fight_reward(p_winner_wallet TEXT, p_base_reward INTEGER, p_fighter_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_owns_nft BOOLEAN;
    v_final_reward INTEGER;
BEGIN
    -- Check if the winner owns the specific NFT
    SELECT EXISTS (
        SELECT 1 FROM public.user_inventory 
        WHERE wallet_address = p_winner_wallet AND pollo_id = p_fighter_id
    ) INTO v_owns_nft;

    IF v_owns_nft THEN
        v_final_reward := p_base_reward * 1.5; -- 50% Bonus for Holders
    ELSE
        v_final_reward := p_base_reward;
    END IF;

    RETURN v_final_reward;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
