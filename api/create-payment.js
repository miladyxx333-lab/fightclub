const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const QRCode = require('qrcode'); // Importar lib

// Configurar Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/** Helper: USD -> SOL (Using Native HTTPS to avoid fetch issues) */
function getSolPrice() {
    return new Promise((resolve) => {
        const url = "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";

        https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.solana && json.solana.usd) {
                        resolve(json.solana.usd);
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

async function usdToSol(usdAmount) {
    try {
        const price = await getSolPrice();
        if (!price) throw new Error("Price API failed");

        return { sol: Number((usdAmount / price).toFixed(6)), price };
    } catch (e) {
        console.error("Price fetch error, using fallback (200 USD/SOL)");
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

module.exports = async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
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

        if (!usd || !wallet) {
            return res.status(400).json({ error: "usd and wallet required" });
        }

        const orderId = `ORDER_${Date.now()}_${uuidv4().slice(0, 6)}`;

        // Convert USD -> SOL
        const { sol: amountSOL, price } = await usdToSol(Number(usd));

        const link = generateSolanaPayLink({
            wallet,
            amountSOL,
            label,
            message,
            orderId
        });

        // Generar QR en Backend (Server-Side Rendering)
        const qrDataUrl = await QRCode.toDataURL(link, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });

        // Guardar en Supabase
        const { data, error } = await supabase
            .from('payment_orders')
            .insert([{
                id: orderId,
                wallet: wallet,
                amount_usd: usd,
                amount_sol: amountSOL,
                status: 'pending',
                memo: orderId,
                created_at: new Date()
            }])
            .select();

        if (error) {
            console.error("Supabase DB Error:", error);
            return res.status(500).json({ error: "Database Error: " + error.message });
        }

        return res.status(200).json({
            order: {
                orderId,
                wallet,
                amountSOL,
                priceUSDperSOL: price,
                link,
                qrDataUrl, // Enviamos la imagen generada
                status: 'pending'
            }
        });
    } catch (err) {
        console.error("Critical Server Error:", err);
        return res.status(500).json({ error: "Internal Server Error: " + err.message });
    }
}
