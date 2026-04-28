const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
 * Handle Timeout API
 * Anyone can call this if a turn has exceeded the time limit (30s).
 * Applies 20 damage to the current player and switches turn.
 */
module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { fightId } = req.body;
        if (!fightId) return res.status(400).json({ error: 'Missing fightId' });

        const { data: fight, error } = await supabase
            .from('arena_fights')
            .select('*')
            .eq('id', fightId)
            .single();

        if (error || !fight) return res.status(404).json({ error: 'Fight not found' });
        if (fight.status !== 'active') return res.status(400).json({ error: 'Fight is not active' });

        const combatState = fight.combat_state || {};
        const lastMoveAt = combatState.last_move_at || new Date(fight.joined_at || fight.created_at).getTime();
        const now = Date.now();
        const elapsed = now - lastMoveAt;

        // Timeout limit: 30 seconds
        if (elapsed < 30000) {
            return res.status(400).json({ 
                error: 'Turn has not timed out yet', 
                remaining: Math.ceil((30000 - elapsed) / 1000) 
            });
        }

        const currentTurn = fight.current_turn || 'creator';
        const nextTurn = currentTurn === 'creator' ? 'challenger' : 'creator';

        // Apply penalty (20 damage)
        const updatedState = { ...combatState };
        if (updatedState.creator_hp === undefined) updatedState.creator_hp = 100;
        if (updatedState.challenger_hp === undefined) updatedState.challenger_hp = 100;

        if (currentTurn === 'creator') {
            updatedState.creator_hp = Math.max(0, updatedState.creator_hp - 20);
        } else {
            updatedState.challenger_hp = Math.max(0, updatedState.challenger_hp - 20);
        }

        updatedState.last_move_at = now;
        updatedState.last_timeout_at = now;
        updatedState.timeout_count = (updatedState.timeout_count || 0) + 1;

        await supabase
            .from('arena_fights')
            .update({ 
                combat_state: updatedState,
                current_turn: nextTurn
            })
            .eq('id', fightId);

        console.log(`[TIMEOUT] Penalty applied to ${currentTurn} in fight ${fightId}. Next turn: ${nextTurn}`);

        return res.status(200).json({
            success: true,
            message: `Timeout penalty applied to ${currentTurn}.`,
            nextTurn,
            hp: {
                creator: updatedState.creator_hp,
                challenger: updatedState.challenger_hp
            }
        });

    } catch (err) {
        console.error('API Error (Handle Timeout):', err);
        return res.status(500).json({ error: err.message });
    }
}
