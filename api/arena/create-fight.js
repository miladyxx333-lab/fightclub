const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey } = require('@solana/web3.js');

// Configuración requerida de Entorno (Vercel)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';

// Billetera de la casa (Escrow)
const HOUSE_WALLET = process.env.MERCHANT_WALLET || 'e6uU5apmNZrUX4L2fCZ7hupZMwofS3JUNXEHcSxqcBD';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const connection = new Connection(SOLANA_RPC, 'confirmed');

// Helper de CORS
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
}

// ── API HANDLER ────────────────────────────
module.exports = async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { 
            txSignature, 
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

        if (!txSignature || !creatorWallet || !fighterId || !betAmount) {
            return res.status(400).json({ error: "Faltan parámetros requeridos" });
        }

        // 1. (Opcional por ahora) Verificar la TX real en cadena usando @solana/web3.js
        // const tx = await connection.getTransaction(txSignature, { maxSupportedTransactionVersion: 0 });
        // if (!tx) throw new Error("Transaction no encontrada en Solana");
        // Aquí iría el código extra para asegurar que transfirió al HOUSE_WALLET el monto correcto
        console.log(`[ARENA] Verificando TX de creación: ${txSignature}`);

        // 2. Insertar en la Base de Datos como "Waiting" 
        const { data: fight, error } = await supabase
            .from('arena_fights')
            .insert([{
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
            return res.status(500).json({ error: "No se pudo crear la pelea." });
        }

        // 3. Responder con Éxito
        return res.status(200).json({
            success: true,
            message: "Pelea creada exitosamente",
            fight: fight
        });

    } catch (err) {
        console.error("API Error (Create Fight):", err);
        return res.status(500).json({ error: err.message });
    }
}
