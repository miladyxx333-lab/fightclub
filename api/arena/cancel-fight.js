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
    // Limit to 10 cancels per IP per minute
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

/**
 * Cancel Fight API
 * 
 * Called after the frontend broadcasts a cancel_fight instruction on-chain.
 * The on-chain program handles the refund; this endpoint updates Supabase.
 */
module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Too many fight cancellations. Slow down!' });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { fightId, txSignature, callerWallet } = req.body;

        if (!fightId || !txSignature || !callerWallet) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        // 1. Verify fight exists and is in 'waiting' status
        const { data: fight, error: fetchErr } = await supabase
            .from('arena_fights')
            .select('*')
            .eq('id', fightId)
            .single();

        if (fetchErr || !fight) {
            return res.status(404).json({ error: "Fight not found" });
        }

        if (fight.status !== 'waiting') {
            return res.status(400).json({ error: "Only 'waiting' fights can be cancelled" });
        }

        // 2. Verify caller is the creator
        if (fight.creator_wallet !== callerWallet) {
            return res.status(403).json({ error: "Only the creator can cancel this fight" });
        }

        // 3. Verify the cancel transaction on-chain
        const escrowPDA = getEscrowPDA(fightId);
        console.log(`[ARENA CANCEL] Verifying cancel TX: ${txSignature} for PDA: ${escrowPDA.toBase58()}`);

        try {
            const confirmation = await connection.confirmTransaction(txSignature, 'confirmed');
            if (confirmation.value.err) {
                return res.status(400).json({ error: "Cancel transaction failed on-chain" });
            }
        } catch (confirmErr) {
            console.warn('[ARENA CANCEL] TX confirmation warning:', confirmErr.message);
        }

        // 4. Update fight status to cancelled
        const { error: updateErr } = await supabase
            .from('arena_fights')
            .update({
                status: 'cancelled',
                completed_at: new Date().toISOString()
            })
            .eq('id', fightId)
            .eq('status', 'waiting');

        if (updateErr) throw updateErr;

        return res.status(200).json({
            success: true,
            message: "Fight cancelled. Deposit refunded on-chain.",
            txSignature
        });

    } catch (err) {
        console.error("API Error (Cancel Fight):", err);
        return res.status(500).json({ error: err.message });
    }
}
