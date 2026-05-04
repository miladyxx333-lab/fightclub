
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const { spawn, execSync } = require('child_process');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';
const BOT_WALLET = '3rpVdAt6m86rA...tC24'; // Simplified for logging
const BOT_REAL_WALLET = 'FiGHt1111111111111111111111111111111111111'; // Placeholder or actual from bot_key

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

function isBotRunning() {
    try {
        const stdout = execSync('pgrep -f arena_bot.js').toString();
        return stdout.length > 0;
    } catch (e) {
        return false;
    }
}

/**
 * Bot Pulse API
 * Triggered by the frontend lobby.
 * Ensures the bot has an active presence.
 */
module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const botAddress = '3rpVdAt6m86rA6D88888888888888888888888888';

        // 0. Auto-Spawn Process (Local Dev only)
        if (!isBotRunning()) {
            console.log('[BOT PULSE] Bot not detected. Spawning process...');
            const botPath = path.join(process.cwd(), 'simulation', 'arena_bot.js');
            const botProcess = spawn('node', [botPath], {
                detached: true,
                stdio: 'ignore'
            });
            botProcess.unref();
        }

        // 1. Check if bot already has a waiting or active fight
        const { data: currentFights } = await supabase
            .from('arena_fights')
            .select('*')
            .eq('creator_wallet', botAddress)
            .in('status', ['waiting', 'active']);

        if (currentFights && currentFights.length > 0) {
            return res.status(200).json({ status: 'active', message: 'Bot is already in a fight.' });
        }

        // 2. Check if there are human challenges to join
        const { data: waitingFights } = await supabase
            .from('arena_fights')
            .select('*')
            .eq('status', 'waiting')
            .neq('creator_wallet', botAddress)
            .limit(1);

        if (waitingFights && waitingFights.length > 0) {
            const f = waitingFights[0];
            console.log(`[BOT PULSE] Bot joining human fight: ${f.id}`);
            
            // Note: In a real serverless env, we'd call the join-fight API internally
            // For now, we update the DB directly as a "shortcut" for the bot
            await supabase.from('arena_fights').update({
                challenger_wallet: botAddress,
                challenger_username: "Agent_Matrix",
                challenger_fighter_id: "777",
                challenger_fighter_name: "Agent Matrix",
                challenger_fighter_image: "https://raw.githubusercontent.com/miladyxx333-lab/fightclub/main/assets/images/1.jpeg",
                status: 'active',
                current_turn: 'creator',
                joined_at: new Date().toISOString()
            }).eq('id', f.id);

            return res.status(200).json({ status: 'joined', fightId: f.id });
        }

        // 3. Create a new challenge if none exists
        const fightId = uuidv4();
        console.log(`[BOT PULSE] Bot creating new challenge: ${fightId}`);
        
        await supabase.from('arena_fights').insert([{
            id: fightId,
            creator_wallet: botAddress,
            creator_username: "Agent_Matrix",
            creator_fighter_id: "777",
            creator_fighter_name: "Agent Matrix",
            creator_fighter_image: "https://raw.githubusercontent.com/miladyxx333-lab/fightclub/main/assets/images/1.jpeg",
            token_mint: "credits",
            token_symbol: "CRD",
            bet_amount: 50,
            bet_amount_display: "50 Credits",
            creator_deposit_tx: "bot_auto_spawn",
            status: 'waiting'
        }]);

        return res.status(200).json({ status: 'created', fightId });

    } catch (err) {
        console.error('Bot Pulse Error:', err);
        return res.status(500).json({ error: err.message });
    }
}
