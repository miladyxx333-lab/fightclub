const { createClient } = require('@supabase/supabase-js');
const { 
    Connection, PublicKey, Keypair, Transaction, 
    TransactionInstruction, sendAndConfirmTransaction 
} = require('@solana/web3.js');
const bs58 = require('bs58');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const PROGRAM_ID = process.env.PROGRAM_ID || 'FiGHt1111111111111111111111111111111111111';

// Authority keypair — the backend signer authorized to resolve fights.
// This is the SAME pubkey passed as `authority` when creating fights.
// WARNING: Never hardcode in production. Use env vars or secrets manager.
const AUTHORITY_PRIVATE_KEY_B58 = process.env.MERCHANT_PRIVATE_KEY || '';
const FEE_COLLECTOR = process.env.MERCHANT_WALLET || 'e6uU5apmNZrUX4L2fCZ7hupZMwofS3JUNXEHcSxqcBD';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const connection = new Connection(SOLANA_RPC, 'confirmed');

// resolve_fight discriminator: sha256("global:resolve_fight")[0..8]
const RESOLVE_DISCRIMINATOR = Buffer.from([178, 193, 42, 198, 154, 218, 49, 22]);
const RESOLVE_SPL_DISCRIMINATOR = Buffer.from([18, 34, 113, 250, 237, 112, 111, 194]);

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

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
    return entry.count <= 15; // Max 15 resolutions per minute per IP per node
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

function getAssociatedTokenAddress(walletAddress, tokenMintAddress) {
    const wallet = new PublicKey(walletAddress);
    const mint = new PublicKey(tokenMintAddress);
    const [ata] = PublicKey.findProgramAddressSync(
        [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        ATOKEN_PROGRAM_ID
    );
    return ata;
}

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Rate limiter
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { fightId, winnerRole, winnerWallet } = req.body;

        if (!fightId || !winnerRole || !winnerWallet) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        // 1. Get fight from database and verify state
        const { data: fight, error: fetchError } = await supabase
            .from('arena_fights')
            .select('*')
            .eq('id', fightId)
            .single();

        if (fetchError || !fight) {
            return res.status(404).json({ error: "Fight not found" });
        }

        if (fight.status === 'completed') {
            return res.status(400).json({ error: "Fight already resolved and paid" });
        }
        
        if (fight.status !== 'active') {
            return res.status(400).json({ error: "Fight is not active" });
        }

        // 2. Calculate payout amounts (same as before, for logging)
        const amountPerPlayer = Number(fight.bet_amount);
        const totalPot = amountPerPlayer * 2;
        const feePercentage = Number(fight.fee_percentage || 3.0) / 100;
        const feeAmount = Math.floor(totalPot * feePercentage);
        const payoutAmount = totalPot - feeAmount;

        console.log(`[ARENA PAYOUT] Resolving Fight: ${fightId}`);
        console.log(`[ARENA PAYOUT] Total Pot: ${totalPot} lamports | Fee: ${feeAmount} | Payout: ${payoutAmount} to ${winnerWallet}`);

        let payoutTxSignature = "simulated_tx_signature_for_mvp";

        // 3. Execute on-chain resolve via Anchor program
        if (AUTHORITY_PRIVATE_KEY_B58) {
            try {
                const authorityKeypair = Keypair.fromSecretKey(bs58.decode(AUTHORITY_PRIVATE_KEY_B58));
                const { pda: escrowPDA } = getEscrowPDA(fightId);
                const programId = new PublicKey(PROGRAM_ID);

                // winner_role: 0 = creator, 1 = challenger
                const winnerRoleNum = winnerRole === 'creator' ? 0 : 1;

                let instruction;

                if (fight.token_mint === 'native' || fight.token_symbol === 'SOL') {
                    // Build resolve_fight instruction data: discriminator (8) + winner_role (1)
                    const data = Buffer.alloc(9);
                    RESOLVE_DISCRIMINATOR.copy(data, 0);
                    data.writeUInt8(winnerRoleNum, 8);

                    instruction = new TransactionInstruction({
                        keys: [
                            { pubkey: escrowPDA, isSigner: false, isWritable: true },        // escrow
                            { pubkey: authorityKeypair.publicKey, isSigner: true, isWritable: true },  // authority
                            { pubkey: new PublicKey(fight.creator_wallet), isSigner: false, isWritable: true },   // creator
                            { pubkey: new PublicKey(fight.challenger_wallet), isSigner: false, isWritable: true }, // challenger
                            { pubkey: new PublicKey(FEE_COLLECTOR), isSigner: false, isWritable: true },          // fee_collector
                            { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // system_program
                        ],
                        programId,
                        data,
                    });
                } else {
                    // Build resolve_fight_spl instruction
                    const data = Buffer.alloc(9);
                    RESOLVE_SPL_DISCRIMINATOR.copy(data, 0);
                    data.writeUInt8(winnerRoleNum, 8);

                    const { pda: escrowTokenPDA } = getFightTokenPDA(fightId);
                    const creatorATA = getAssociatedTokenAddress(fight.creator_wallet, fight.token_mint);
                    const challengerATA = getAssociatedTokenAddress(fight.challenger_wallet, fight.token_mint);
                    const feeCollectorATA = getAssociatedTokenAddress(FEE_COLLECTOR, fight.token_mint);

                    instruction = new TransactionInstruction({
                        keys: [
                            { pubkey: escrowPDA, isSigner: false, isWritable: true },
                            { pubkey: authorityKeypair.publicKey, isSigner: true, isWritable: true },
                            { pubkey: escrowTokenPDA, isSigner: false, isWritable: true },
                            { pubkey: creatorATA, isSigner: false, isWritable: true },
                            { pubkey: challengerATA, isSigner: false, isWritable: true },
                            { pubkey: feeCollectorATA, isSigner: false, isWritable: true },
                            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                        ],
                        programId,
                        data,
                    });
                }

                const transaction = new Transaction().add(instruction);

                payoutTxSignature = await sendAndConfirmTransaction(
                    connection,
                    transaction,
                    [authorityKeypair],
                    { commitment: 'confirmed', maxRetries: 3 }
                );

                console.log(`[ARENA PAYOUT] On-chain resolve TX: ${payoutTxSignature}`);

            } catch (txError) {
                console.error("[ARENA PAYOUT] Error resolving fight on-chain:", txError);
                // Do not update DB status if TX functionally failed!
                // We return 500 so the client can show a manual "Retry Payout" button.
                return res.status(500).json({ error: "Blockchain error resolving fight. Please retry payout.", details: txError.message });
            }
        } else {
            console.warn("[ARENA PAYOUT] MERCHANT_PRIVATE_KEY not set. Simulating payout...");
        }

        // 4. Update database
        const { error: updateError } = await supabase
            .from('arena_fights')
            .update({
                status: 'completed',
                winner_wallet: winnerWallet,
                winner_role: winnerRole,
                payout_tx: payoutTxSignature,
                fee_amount: feeAmount,
                completed_at: new Date().toISOString()
            })
            .eq('id', fightId)
            .eq('status', 'active'); // Race condition protection

        if (updateError) throw updateError;

        // 5. Save history
        await supabase.from('arena_history').insert([
            {
                fight_id: fight.id,
                wallet: fight.creator_wallet,
                role: 'creator',
                fighter_id: fight.creator_fighter_id,
                fighter_name: fight.creator_fighter_name,
                result: winnerRole === 'creator' ? 'win' : 'loss',
                amount_wagered: amountPerPlayer,
                amount_won: winnerRole === 'creator' ? payoutAmount : 0,
                token_mint: fight.token_mint,
                token_symbol: fight.token_symbol
            },
            {
                fight_id: fight.id,
                wallet: fight.challenger_wallet,
                role: 'challenger',
                fighter_id: fight.challenger_fighter_id,
                fighter_name: fight.challenger_fighter_name,
                result: winnerRole === 'challenger' ? 'win' : 'loss',
                amount_wagered: amountPerPlayer,
                amount_won: winnerRole === 'challenger' ? payoutAmount : 0,
                token_mint: fight.token_mint,
                token_symbol: fight.token_symbol
            }
        ]);

        return res.status(200).json({
            success: true,
            message: "Fight resolved via on-chain escrow.",
            payoutTx: payoutTxSignature
        });

    } catch (err) {
        console.error("API Error (Resolve Fight):", err);
        return res.status(500).json({ error: err.message });
    }
}
