const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
    // Higher limit for combat: 60 reveals/minute
    return entry.count <= 60;
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

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Reveal Round API
 * 
 * Called AFTER the player submits their prediction.
 * The backend reveals its serverSeed, computes the roll,
 * and returns the result. The client can independently
 * verify: SHA-256(serverSeed) === commitment.
 * 
 * POST /api/arena/reveal-round
 * Body: { fightId, round, prediction, clientSeed }
 * Response: { serverSeed, commitment, roll, hit, damage, counterDamage }
 */
module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Rate limit exceeded for combat engine.' });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { fightId, round, prediction, clientSeed } = req.body;

        if (!fightId || round === undefined || !prediction || !clientSeed) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        if (!['low', 'high'].includes(prediction)) {
            return res.status(400).json({ error: 'Prediction must be "low" or "high"' });
        }

        // 1. Retrieve the fight and stored seed from Supabase
        const { data: fight, error } = await supabase
            .from('arena_fights')
            .select('status, combat_state')
            .eq('id', fightId)
            .single();

        if (error || !fight) {
            return res.status(404).json({ error: 'Fight not found' });
        }

        if (fight.status !== 'active') {
            return res.status(400).json({ error: 'Fight is not active' });
        }

        // 2. Get the stored server seed for this round
        const combatState = fight.combat_state || {};
        const serverSeed = combatState[`round_${round}_seed`];
        const commitment = combatState[`round_${round}_commitment`];
        const used = combatState[`round_${round}_used`];

        if (!serverSeed || !commitment) {
            return res.status(400).json({ error: `No commitment found for round ${round}. Call commit-round first.` });
        }

        if (used) {
            return res.status(400).json({ error: `Round ${round} has already been revealed. No replay allowed.` });
        }

        // 3. Verify our own commitment (sanity check)
        const verifiedCommitment = sha256(serverSeed);
        if (verifiedCommitment !== commitment) {
            console.error('[REVEAL] Internal commitment mismatch!');
            return res.status(500).json({ error: 'Internal commitment verification failed' });
        }

        // 4. Calculate the provably fair roll
        const combined = serverSeed + ':' + clientSeed;
        const rollHash = sha256(combined);
        const rollNum = parseInt(rollHash.substring(0, 8), 16);
        const roll = (rollNum % 6) + 1;

        // 5. Determine hit/miss and damage
        const isLow = roll <= 3;
        const isHigh = roll >= 4;
        const hit = (prediction === 'low' && isLow) || (prediction === 'high' && isHigh);

        const baseDamage = 20;
        const critMultiplier = (roll === 1 || roll === 6) ? 1.5 : 1;
        const damage = hit ? Math.floor(baseDamage * critMultiplier) : 0;
        const counterDamage = hit ? 0 : Math.floor(baseDamage * 0.8);

        // 6. Mark round as used (prevent replay)
        const updatedState = { ...combatState };
        updatedState[`round_${round}_used`] = true;
        updatedState[`round_${round}_clientSeed`] = clientSeed;
        updatedState[`round_${round}_roll`] = roll;
        updatedState[`round_${round}_hit`] = hit;

        await supabase
            .from('arena_fights')
            .update({ combat_state: updatedState })
            .eq('id', fightId);

        console.log(`[REVEAL] Fight ${fightId} Round ${round}: roll=${roll} prediction=${prediction} hit=${hit}`);

        // 7. Return everything the client needs for verification
        return res.status(200).json({
            serverSeed,
            commitment,
            clientSeed,
            roll,
            rollHash: rollHash.substring(0, 16),
            prediction,
            hit,
            damage,
            counterDamage,
            round: Number(round),
            // Verification instructions for transparency
            verification: {
                step1: `SHA-256("${serverSeed.slice(0, 8)}...") = "${commitment.slice(0, 16)}..." ✓`,
                step2: `SHA-256("${serverSeed.slice(0, 8)}...:${clientSeed.slice(0, 8)}...")[0:8] mod 6 + 1 = ${roll}`,
            }
        });

    } catch (err) {
        console.error('API Error (Reveal Round):', err);
        return res.status(500).json({ error: err.message });
    }
}
