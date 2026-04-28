const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey } = require('@solana/web3.js');

// Configuración
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const PROGRAM_ID = process.env.PROGRAM_ID || 'FiGHt1111111111111111111111111111111111111';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const connection = new Connection(SOLANA_RPC, 'confirmed');

// Basic in-memory rate limiting (Serverless Edge)
const rateLimitCache = new Map();
function checkRateLimit(ip) {
    if (!ip) return true;
    const now = Date.now();
    const entry = rateLimitCache.get(ip) || { count: 0, resetAt: now + 60000 };
    if (now > entry.resetAt) {
        entry.count = 1;
        entry.resetAt = now + 60000;
    } else {
        entry.count++;
    }
    rateLimitCache.set(ip, entry);
    // Limit to 10 creates per IP per minute
    return entry.count <= 10;
}

function setCorsHeaders(req, res) {
    const origin = req.headers.origin;
    const allowed = process.env.ALLOWED_ORIGIN || origin || '*';
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
}

/**
 * Derive the escrow PDA for a fight ID (mirrors the on-chain program).
 */
function getEscrowPDA(fightId) {
    const programId = new PublicKey(PROGRAM_ID);
    const [pda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from('fight_escrow'), Buffer.from(fightId)],
        programId
    );
    return { pda, bump };
}

function getFightTokenPDA(fightId) {
    const programId = new PublicKey(PROGRAM_ID);
    const [pda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from('fight_escrow_token'), Buffer.from(fightId)],
        programId
    );
    return { pda, bump };
}

// ── API HANDLER ────────────────────────────
module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Too many fight creations. Slow down!' });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { 
            txSignature, 
            fightId,        // PDA seed — generated client-side
            escrowPDA,      // Expected PDA address for verification
            creatorWallet, 
            username,
            fighterId, 
            fighterName, 
            fighterImage,
            tokenMint, 
            tokenSymbol, 
            betAmount,
            betDisplay
        } = req.body;

        if (!txSignature || !fightId || !creatorWallet || !fighterId || !betAmount) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        // 1. Payment Verification
        const isCreditFight = tokenMint === 'credits';

        if (!isCreditFight) {
            // Verify PDA derivation matches
            const { pda: expectedPDA } = getEscrowPDA(fightId);
            if (escrowPDA && expectedPDA.toBase58() !== escrowPDA) {
                console.error(`[ARENA] PDA mismatch! Expected ${expectedPDA.toBase58()}, got ${escrowPDA}`);
                return res.status(400).json({ error: "Escrow PDA verification failed" });
            }

            // Verify the transaction exists on-chain
            console.log(`[ARENA] Verifying escrow TX: ${txSignature} for PDA: ${expectedPDA.toBase58()}`);
            
            try {
                const confirmation = await connection.confirmTransaction(txSignature, 'confirmed');
                if (confirmation.value.err) {
                    return res.status(400).json({ error: "Transaction failed on-chain" });
                }
            } catch (confirmErr) {
                console.warn('[ARENA] TX confirmation check failed:', confirmErr.message);
            }

            // Verify PDA has received the funds
            try {
                if (!tokenMint || tokenMint === 'native') {
                    const pdaBalance = await connection.getBalance(expectedPDA);
                    if (pdaBalance < Number(betAmount)) {
                        console.warn(`[ARENA] PDA balance ${pdaBalance} < expected ${betAmount}.`);
                    }
                } else {
                    const { pda: tokenPDA } = getFightTokenPDA(fightId);
                    const tokenBal = await connection.getTokenAccountBalance(tokenPDA);
                    if (Number(tokenBal.value.amount) < Number(betAmount)) {
                        console.warn(`[ARENA] SPL balance ${tokenBal.value.amount} < expected.`);
                    }
                }
            } catch (balanceErr) {
                console.warn('[ARENA] Balance check warning:', balanceErr.message);
            }
        } else {
            // Credits mode: Deduct from user wallet
            console.log(`[ARENA] Deducting credits for fight creation: ${fightId}`);
            const { data: deductSuccess, error: deductError } = await supabase.rpc('deduct_credits_wallet', {
                p_wallet: creatorWallet,
                p_amount: betAmount
            });

            if (deductError || !deductSuccess) {
                return res.status(400).json({ error: "Insufficient credits to create this fight." });
            }
        }

        // 4. Insert fight record into Supabase with the client-provided fight ID
        const { data: fight, error } = await supabase
            .from('arena_fights')
            .insert([{
                id: fightId,  // Use the PDA seed as the fight ID
                creator_wallet: creatorWallet,
                creator_username: username || 'Unknown',
                creator_fighter_id: fighterId,
                creator_fighter_name: fighterName || `Fighter #${fighterId}`,
                creator_fighter_image: fighterImage,
                token_mint: tokenMint,
                token_symbol: tokenSymbol,
                bet_amount: betAmount,
                bet_amount_display: betDisplay,
                creator_deposit_tx: txSignature,
                status: 'waiting'
            }])
            .select()
            .single();

        if (error) {
            console.error("Supabase Error (Create Fight):", error);
            return res.status(500).json({ error: "Could not register the fight." });
        }

        // 5. Respond with success
        return res.status(200).json({
            success: true,
            message: isCreditFight ? "Fight created with credits" : "Fight created with on-chain escrow",
            fight: fight,
            escrowPDA: isCreditFight ? null : getEscrowPDA(fightId).pda.toBase58()
        });

    } catch (err) {
        console.error("API Error (Create Fight):", err);
        return res.status(500).json({ error: err.message });
    }
}
