const { createClient } = require('@supabase/supabase-js');
const { Connection } = require('@solana/web3.js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
            return res.status(400).json({ error: "Faltan parámetros requeridos" });
        }

        // 1. (Opcional) Verificar que la TX fue confirmada mandando tokens a la casa
        console.log(`[ARENA] Verificando TX de unión a pelea ${fightId}: ${txSignature}`);

        // 2. Comprobar que la pelea sigue "waiting" para evitar Double-Spending (carrera asíncrona)
        const { data: fightCheck } = await supabase
            .from('arena_fights')
            .select('status, challenger_wallet')
            .eq('id', fightId)
            .single();

        if (!fightCheck) return res.status(404).json({ error: "Pelea no encontrada." });
        if (fightCheck.status !== 'waiting') return res.status(400).json({ error: "Alguien más ya tomó esta pelea." });

        // 3. Bloquear pelea y asignar Challenger
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
                joined_at: new Date().toISOString()
            })
            .eq('id', fightId)
            .eq('status', 'waiting') // Seguridad extra RLS
            .select()
            .single();

        if (error) {
            console.error("Supabase Error (Join Fight):", error);
            return res.status(500).json({ error: "Error de base de datos al unirse." });
        }

        // 4. Responder con Éxito (¡COMBATE LISTO!)
        return res.status(200).json({
            success: true,
            message: "Te has unido a la pelea exitosamente.",
            fight: join // Esto le indicará al frontend que salte la pantalla a la Arena 3D
        });

    } catch (err) {
        console.error("API Error (Join Fight):", err);
        return res.status(500).json({ error: err.message });
    }
}
