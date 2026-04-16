const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// In-memory store for pending commitments (per fight+round)
// In production, use Redis or Supabase for persistence across serverless invocations
const commitmentStore = new Map();

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
    // Higher limit for combat: 60 commits/minute
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

function generateSecureHex(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Commit Round API
 * 
 * Called at the START of each turn. The backend generates a random
 * serverSeed and returns its SHA-256 hash (commitment).
 * The serverSeed is stored server-side until the player acts.
 * 
 * POST /api/arena/commit-round
 * Body: { fightId, round }
 * Response: { commitment }
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
        const { fightId, round } = req.body;

        if (!fightId || round === undefined) {
            return res.status(400).json({ error: 'Missing fightId or round' });
        }

        // Verify the fight exists and is active
        const { data: fight, error } = await supabase
            .from('arena_fights')
            .select('status')
            .eq('id', fightId)
            .single();

        if (error || !fight) {
            return res.status(404).json({ error: 'Fight not found' });
        }

        if (fight.status !== 'active') {
            return res.status(400).json({ error: 'Fight is not active' });
        }

        // Generate cryptographically secure server seed
        const serverSeed = generateSecureHex(32);
        const commitment = sha256(serverSeed);

        // Store server seed for this round (key = fightId:round)
        const key = `${fightId}:${round}`;
        commitmentStore.set(key, {
            serverSeed,
            commitment,
            createdAt: Date.now()
        });

        // Also persist to Supabase for cross-instance access
        // (Vercel serverless functions may not share memory)
        await supabase
            .from('arena_fights')
            .update({
                combat_state: {
                    ...(fight.combat_state || {}),
                    [`round_${round}_commitment`]: commitment,
                    [`round_${round}_seed`]: serverSeed,
                    [`round_${round}_used`]: false,
                }
            })
            .eq('id', fightId);

        console.log(`[COMMIT] Fight ${fightId} Round ${round}: commitment=${commitment.slice(0, 16)}...`);

        return res.status(200).json({
            commitment,
            round: Number(round)
        });

    } catch (err) {
        console.error('API Error (Commit Round):', err);
        return res.status(500).json({ error: err.message });
    }
}
