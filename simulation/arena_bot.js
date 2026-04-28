/**
 * ARENA BOT AGENT v1.0
 * Autonomous agent that plays in the P2P Arena using Devnet SOL.
 */

const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } = require('@solana/web3.js');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const bs58 = require('bs58');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
global.WebSocket = WebSocket;

// --- Configuration ---
const RPC_URL = 'https://api.devnet.solana.com';
const SUPABASE_URL = 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';
const PROGRAM_ID = 'FiGHt1111111111111111111111111111111111111';
const API_BASE = process.env.API_BASE || 'https://www.fightclub.wtf';
const GITHUB_IMAGES_BASE = 'https://raw.githubusercontent.com/miladyxx333-lab/fightclub/main/assets/images/';

// --- Bot Identity ---
let botKey;
try {
    const fs = require('fs');
    if (fs.existsSync('./bot_key.json')) {
        const secret = JSON.parse(fs.readFileSync('./bot_key.json'));
        botKey = Keypair.fromSecretKey(Uint8Array.from(secret));
    } else {
        botKey = Keypair.generate();
        fs.writeFileSync('./bot_key.json', JSON.stringify(Array.from(botKey.secretKey)));
    }
} catch (e) {
    botKey = Keypair.generate();
}

console.log(`🤖 BOT INITIALIZED: ${botKey.publicKey.toBase58()}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const connection = new Connection(RPC_URL, 'confirmed');

// --- State ---
let currentFightId = null;
let botRole = null; // 'creator', 'challenger', 'creator_active'
let sessionUser = null;
const startTime = Date.now();
const LIFETIME_MS = 24 * 60 * 60 * 1000;
const DAILY_ALLOWANCE = 500;
const activeChannels = new Map();

// --- Helpers ---
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function botAuth() {
    try {
        const { data, error } = await supabase.rpc('wallet_login', {
            p_wallet: botKey.publicKey.toBase58()
        });
        if (error) throw error;
        if (data.credits < DAILY_ALLOWANCE) {
            await supabase.rpc('add_credits_wallet', {
                p_wallet: botKey.publicKey.toBase58(),
                p_amount: DAILY_ALLOWANCE - data.credits
            });
            data.credits = DAILY_ALLOWANCE;
        }
        return data;
    } catch (e) {
        console.error("[BOT] Auth Error:", e.message);
        return null;
    }
}

// --- Bot Actions ---

async function createFightChallenge() {
    const fightId = uuidv4();
    const betAmount = 50;
    console.log(`[BOT] Creating fight ${fightId}...`);

    const { error } = await supabase.from('arena_fights').insert([{
        id: fightId,
        creator_wallet: botKey.publicKey.toBase58(),
        creator_username: "Agent_Matrix",
        creator_fighter_id: Math.floor(Math.random() * 10000).toString(),
        creator_fighter_name: "Agent Matrix",
        creator_fighter_image: `${GITHUB_IMAGES_BASE}${Math.floor(Math.random() * 10000)}.jpeg`,
        token_mint: "credits",
        token_symbol: "CRD",
        bet_amount: betAmount,
        bet_amount_display: `${betAmount} Credits`,
        creator_deposit_tx: "internal_bot_tx",
        status: 'waiting',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }]);

    if (!error) {
        currentFightId = fightId;
        botRole = 'creator';
    }
}

async function joinHumanFight(fight) {
    console.log(`[BOT] Joining fight ${fight.id}...`);
    const { error } = await supabase.from('arena_fights').update({
        challenger_wallet: botKey.publicKey.toBase58(),
        challenger_username: "Agent_Matrix",
        challenger_fighter_id: Math.floor(Math.random() * 10000).toString(),
        challenger_fighter_name: "Agent Matrix",
        challenger_fighter_image: `${GITHUB_IMAGES_BASE}${Math.floor(Math.random() * 10000)}.jpeg`,
        status: 'active',
        joined_at: new Date().toISOString()
    }).eq('id', fight.id);

    if (!error) {
        currentFightId = fight.id;
        botRole = 'challenger';
        startCombatLoop(fight.id);
    }
}

async function startCombatLoop(fightId) {
    if (activeChannels.has(fightId)) return;
    
    console.log(`[BOT] Starting combat for ${fightId}...`);
    const channel = supabase.channel(`fight:${fightId}`);

    channel.on('broadcast', { event: 'turn_result' }, (payload) => {
        handleTurn(fightId, payload.payload);
    }).subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log(`[BOT] Subscribed to ${fightId}`);
            if (botRole && botRole.startsWith('creator')) {
                makeMove(fightId, 1);
            }
        }
    });

    activeChannels.set(fightId, channel);

    // Resend Round 1 if human hasn't responded (for persistence/refreshes)
    const resendInterval = setInterval(() => {
        if (currentFightId === fightId && botRole && botRole.startsWith('creator')) {
            console.log(`[BOT] Resending round 1 move...`);
            makeMove(fightId, 1);
        } else {
            clearInterval(resendInterval);
        }
    }, 15000);
}

async function makeMove(fightId, round) {
    const channel = activeChannels.get(fightId);
    if (!channel) return;

    try {
        const prediction = Math.random() > 0.5 ? 'high' : 'low';
        const clientSeed = crypto.randomBytes(8).toString('hex');

        // 1. Commit
        const resCommit = await fetch(`${API_BASE}/api/arena/commit-round`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fightId, round })
        });
        const commitData = await resCommit.json();

        // 2. Reveal
        const resReveal = await fetch(`${API_BASE}/api/arena/reveal-round`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fightId, round, prediction, clientSeed })
        });
        const result = await resReveal.json();

        console.log(`[BOT] Round ${round} move: ${prediction} (Roll: ${result.roll}, Hit: ${result.hit})`);

        // 3. Broadcast
        channel.send({
            type: 'broadcast',
            event: 'turn_result',
            payload: {
                player: botRole.startsWith('creator') ? 'creator' : 'challenger',
                prediction,
                roll: result.roll,
                serverSeed: result.serverSeed,
                commitment: result.commitment,
                clientSeed,
                hit: result.hit,
                damage: result.damage,
                counterDamage: result.counterDamage,
                round: round + 1
            }
        });
    } catch (e) {
        console.error("[BOT] Move Error:", e.message);
    }
}

function handleTurn(fightId, data) {
    const myNormalizedRole = botRole.startsWith('creator') ? 'creator' : 'challenger';
    if (data.player !== myNormalizedRole) {
        console.log(`[BOT] Human moved. Now round ${data.round}. My turn.`);
        makeMove(fightId, data.round);
    }
}

async function main() {
    console.log("🚀 AGENT MATRIX ONLINE");
    sessionUser = await botAuth();
    if (!sessionUser) return;

    const botAddress = botKey.publicKey.toBase58();
    
    // Resume active fights
    const { data: actives } = await supabase.from('arena_fights').select('*')
        .eq('status', 'active')
        .or(`creator_wallet.eq.${botAddress},challenger_wallet.eq.${botAddress}`);
    
    if (actives) {
        for (const f of actives) {
            botRole = (f.creator_wallet === botAddress) ? 'creator_active' : 'challenger';
            currentFightId = f.id;
            startCombatLoop(f.id);
        }
    }

    while (Date.now() - startTime < LIFETIME_MS) {
        try {
            sessionUser = await botAuth();
            if (!sessionUser) { await sleep(5000); continue; }

            if (!currentFightId) {
                // Try to join or create
                const { data: waiting } = await supabase.from('arena_fights').select('*').eq('status', 'waiting').limit(5);
                const humanFight = (waiting || []).find(f => f.creator_wallet !== botAddress);
                if (humanFight) await joinHumanFight(humanFight);
                else await createFightChallenge();
            } else {
                // Monitor current fight
                const { data: fight } = await supabase.from('arena_fights').select('*').eq('id', currentFightId).single();
                
                if (fight) {
                    if (fight.status === 'active') {
                        // Check if it's my turn based on DB state (Source of Truth)
                        const myRole = (fight.creator_wallet === botAddress) ? 'creator' : 'challenger';
                        const opponentRole = myRole === 'creator' ? 'challenger' : 'creator';
                        
                        if (fight.current_turn === myRole) {
                            // Determine current round
                            const round = fight.combat_state ? (fight.combat_state.round || 1) : 1;
                            console.log(`[BOT] Persistent Turn Check: My turn (${myRole}) in round ${round}. Triggering move...`);
                            
                            if (!activeChannels.has(currentFightId)) {
                                startCombatLoop(currentFightId);
                            }
                            
                            await makeMove(currentFightId, round);
                        } else {
                            // Monitor opponent turn for timeout
                            const combatState = fight.combat_state || {};
                            const lastMoveAt = combatState.last_move_at || new Date(fight.joined_at || fight.created_at).getTime();
                            const elapsed = Date.now() - lastMoveAt;

                            if (elapsed > 40000) { // 40s buffer (API is 30s)
                                console.log(`[BOT] Opponent (${opponentRole}) is slow. Triggering timeout penalty...`);
                                try {
                                    const res = await fetch(`${API_BASE}/api/arena/handle-timeout`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ fightId: currentFightId })
                                    });
                                    const timeoutResult = await res.json();
                                    console.log(`[BOT] Timeout result:`, timeoutResult.message);

                                    // Broadcast penalty to the channel
                                    const chan = activeChannels.get(currentFightId);
                                    if (chan && timeoutResult.success) {
                                        chan.send({
                                            type: 'broadcast',
                                            event: 'timeout_penalty',
                                            payload: {
                                                penalizedRole: opponentRole,
                                                nextTurn: timeoutResult.nextTurn,
                                                hp: timeoutResult.hp
                                            }
                                        });
                                    }
                                } catch (e) {
                                    console.error("[BOT] Timeout Error:", e.message);
                                }
                            }
                        }
                    } else if (fight.status === 'completed' || fight.status === 'cancelled') {
                        console.log("[BOT] Fight finished/cancelled.");
                        const chan = activeChannels.get(currentFightId);
                        if (chan) { chan.unsubscribe(); activeChannels.delete(currentFightId); }
                        currentFightId = null;
                        botRole = null;
                    }
                } else {
                    currentFightId = null;
                }
            }
        } catch (err) {
            console.error("[BOT] Loop Error:", err.message);
        }
        await sleep(10000); // Check every 10s
    }
}

main();
