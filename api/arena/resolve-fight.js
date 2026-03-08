const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';

// Billetera de la casa (Escrow) y su Private Key
const HOUSE_WALLET_PUBKEY = process.env.MERCHANT_WALLET || 'e6uU5apmNZrUX4L2fCZ7hupZMwofS3JUNXEHcSxqcBD';
// WARNING: NEVER HARDCODE PRIVATE KEYS IN PRODUCTION. USED ONLY FOR PROTOTYPE/MVP.
// Expects a Base58 encoded string in the Vercel environment variables.
const HOUSE_PRIVATE_KEY_B58 = process.env.MERCHANT_PRIVATE_KEY || ''; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const connection = new Connection(SOLANA_RPC, 'confirmed');

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
}

module.exports = async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { fightId, winnerRole, winnerWallet } = req.body;

        if (!fightId || !winnerRole || !winnerWallet) {
            return res.status(400).json({ error: "Faltan parámetros requeridos" });
        }

        // 1. Obtener la pelea y verificar estado
        const { data: fight, error: fetchError } = await supabase
            .from('arena_fights')
            .select('*')
            .eq('id', fightId)
            .single();

        if (fetchError || !fight) {
            return res.status(404).json({ error: "Pelea no encontrada" });
        }

        if (fight.status === 'completed') {
            return res.status(400).json({ error: "La pelea ya fue resuelta y pagada" });
        }
        
        if (fight.status !== 'active') {
            return res.status(400).json({ error: "La pelea no está activa" });
        }

        // 2. Calcular montos
        const amountPerPlayer = Number(fight.bet_amount);
        const totalPot = amountPerPlayer * 2;
        const feePercentage = Number(fight.fee_percentage || 3.0) / 100;
        
        const feeAmount = Math.floor(totalPot * feePercentage);
        const payoutAmount = totalPot - feeAmount;

        console.log(`[ARENA PAYOUT] Resolviendo Pelea: ${fightId}`);
        console.log(`[ARENA PAYOUT] Total Pot: ${totalPot} lamports | Fee: ${feeAmount} | Payout: ${payoutAmount} to ${winnerWallet}`);

        let payoutTxSignature = "simulated_tx_signature_for_mvp";

        // 3. Ejecutar Payout en Blockchain (si hay Private Key configurada)
        if (HOUSE_PRIVATE_KEY_B58) {
            try {
                // Recover Keypair from Base58
                // Note: If storing standard byte array from Phantom, use Keypair.fromSecretKey(Uint8Array.from([...]))
                const houseKeypair = Keypair.fromSecretKey(bs58.decode(HOUSE_PRIVATE_KEY_B58));
                
                const toPubkey = new PublicKey(winnerWallet);
                
                const transaction = new Transaction().add(
                    SystemProgram.transfer({
                        fromPubkey: houseKeypair.publicKey,
                        toPubkey: toPubkey,
                        lamports: payoutAmount,
                    })
                );

                payoutTxSignature = await sendAndConfirmTransaction(
                    connection,
                    transaction,
                    [houseKeypair]
                );
                console.log(`[ARENA PAYOUT] Solana TX Enviada Exitosamente: ${payoutTxSignature}`);

            } catch (txError) {
                console.error("[ARENA PAYOUT] Error enviando pago en Solana:", txError);
                return res.status(500).json({ error: "Error en la Blockchain al intentar pagar la recompensa." });
            }
        } else {
            console.warn("[ARENA PAYOUT] MERCHANT_PRIVATE_KEY no está configurada en .env. Simulando pago...");
        }

        // 4. Actualizar Base de Datos
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
            .eq('status', 'active'); // Evitar race conditions

        if (updateError) throw updateError;

        // 5. Guardar en el Historial
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
            message: "Pelea resuelta y premio enviado.",
            payoutTx: payoutTxSignature
        });

    } catch (err) {
        console.error("API Error (Resolve Fight):", err);
        return res.status(500).json({ error: err.message });
    }
}
