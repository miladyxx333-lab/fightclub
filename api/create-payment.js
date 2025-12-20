
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// Configurar Supabase (Idealmente usar process.env)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/** Helper: USD -> SOL */
async function usdToSol(usdAmount) {
    try {
        const url = "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";
        const res = await fetch(url);
        if (!res.ok) throw new Error("CoinGecko API error");
        const data = await res.json();
        const price = data.solana.usd;
        return { sol: Number((usdAmount / price).toFixed(6)), price };
    } catch (e) {
        console.error("Price fetch error, using fallback");
        return { sol: Number((usdAmount / 200).toFixed(6)), price: 200 };
    }
}

function generateSolanaPayLink({ wallet, amountSOL, label, message, orderId }) {
    const params = new URLSearchParams({
        amount: amountSOL.toString(),
        label: label || "CyberPollo Store",
        message: message || "CyberPollo Credits",
        memo: orderId
    });
    return `solana:${wallet}?${params.toString()}`;
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { usd, wallet, label, message } = req.body;
        if (!usd || !wallet) return res.status(400).json({ error: "usd and wallet required" });

        const orderId = `ORDER_${Date.now()}_${uuidv4().slice(0, 6)}`;
        const { sol: amountSOL, price } = await usdToSol(Number(usd));

        const link = generateSolanaPayLink({
            wallet,
            amountSOL,
            label,
            message,
            orderId
        });

        // Guardar en Supabase
        const { error } = await supabase
            .from('payment_orders')
            .insert([{
                id: orderId,
                wallet: wallet, // La wallet que recibe el pago (tienda)
                amount_usd: usd,
                amount_sol: amountSOL,
                status: 'pending',
                memo: orderId,
                created_at: new Date()
            }]);
        
        if (error) {
            console.error("Supabase Error:", error);
            return res.status(500).json({ error: "DB Error: " + error.message });
        }

        return res.status(200).json({
            order: {
                orderId,
                wallet,
                amountSOL,
                priceUSDperSOL: price,
                link,
                status: 'pending'
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
}
