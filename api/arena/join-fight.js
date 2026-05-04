const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey } = require('@solana/web3.js');

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
    // Limit to 10 joins per IP per minute
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

function getEscrowPDA(fightId) {
    const programId = new PublicKey(PROGRAM_ID);
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('fight_escrow'), Buffer.from(fightId)],
        programId
    );
    return pda;
}

function getFightTokenPDA(fightId) {
    const programId = new PublicKey(PROGRAM_ID);
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('fight_escrow_token'), Buffer.from(fightId)],
        programId
    );
    return pda;
}

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Too many fight joins. Slow down!' });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { 
            fightId,
            txSignature, 
            challengerWallet, 
            username,
            fighterId, 
            fighterName, 
            fighterImage
        } = req.body;

        if (!fightId || !txSignature || !challengerWallet || !fighterId) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        // 1. Verify fight is still waiting (race condition prevention)
        const { data: fightCheck } = await supabase
            .from('arena_fights')
            .select('status, challenger_wallet, bet_amount, token_mint')
            .eq('id', fightId)
            .single();

        if (!fightCheck) return res.status(404).json({ error: "Fight not found." });
        if (fightCheck.status !== 'waiting') return res.status(400).json({ error: "Someone already joined this fight." });

        // 2. Verify payment based on token_mint
        const isCreditFight = fightCheck.token_mint === 'credits';

        if (!isCreditFight) {
            // On-chain escrow verification
            const escrowPDA = getEscrowPDA(fightId);
            console.log(`[ARENA JOIN] Verifying escrow PDA: ${escrowPDA.toBase58()} for fight: ${fightId}`);

            try {
                const confirmation = await connection.confirmTransaction(txSignature, 'confirmed');
                if (confirmation.value.err) {
                    return res.status(400).json({ error: "Join transaction failed on-chain" });
                }
            } catch (confirmErr) {
                console.warn('[ARENA JOIN] TX confirmation warning:', confirmErr.message);
            }

            // Verify PDA now has both deposits
            try {
                const expectedTotal = Number(fightCheck.bet_amount) * 2;
                if (!fightCheck.token_mint || fightCheck.token_mint === 'native') {
                    const pdaBalance = await connection.getBalance(escrowPDA);
                    console.log(`[ARENA JOIN] PDA balance: ${pdaBalance} lamports (expected ~${expectedTotal})`);
                } else {
                    const tokenPDA = getFightTokenPDA(fightId);
                    const tokenBal = await connection.getTokenAccountBalance(tokenPDA);
                    console.log(`[ARENA JOIN] SPL Token balance: ${tokenBal.value.amount} (expected ~${expectedTotal})`);
                }
            } catch (balanceErr) {
                console.warn('[ARENA JOIN] Balance check warning:', balanceErr.message);
            }
        } else {
            // Credits verification: Deduct credits from challenger
            console.log(`[ARENA JOIN] Deducting credits for fight: ${fightId}`);
            const { data: deductSuccess, error: deductError } = await supabase.rpc('deduct_credits_wallet', {
                p_wallet: challengerWallet,
                p_amount: fightCheck.bet_amount
            });

            if (deductError || !deductSuccess) {
                return res.status(400).json({ error: "Insufficient credits to join this fight." });
            }
        }

        // 3. Update fight status to active and assign challenger
        const { data: join, error } = await supabase
            .from('arena_fights')
            .update({
                challenger_wallet: challengerWallet,
                challenger_username: username || 'Unknown',
                challenger_fighter_id: fighterId,
                challenger_fighter_name: fighterName || `Fighter #${fighterId}`,
                challenger_fighter_image: fighterImage,
                challenger_deposit_tx: txSignature,
                status: 'active',
                current_turn: 'creator',
                joined_at: new Date().toISOString()
            })
            .eq('id', fightId)
            .eq('status', 'waiting') // Race condition safety
            .select()
            .single();

        if (error) {
            console.error("Supabase Error (Join Fight):", error);
            return res.status(500).json({ error: "Database error while joining." });
        }

        // 4. Success — combat is ready
        return res.status(200).json({
            success: true,
            message: isCreditFight ? "Joined fight with credits." : "Joined fight with on-chain escrow verified.",
            fight: join,
            escrowPDA: isCreditFight ? null : getEscrowPDA(fightId).toBase58()
        });

    } catch (err) {
        console.error("API Error (Join Fight):", err);
        return res.status(500).json({ error: err.message });
    }
}
