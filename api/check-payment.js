
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';

// Configurar Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configurar RPC Solana
const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const connection = new Connection(SOLANA_RPC, "confirmed");

/** Verifica on-chain si llegó la transacción */
async function findPaymentByMemoAndAmount(receiverWallet, expectedSOL, orderId) {
    try {
        const pubKey = new PublicKey(receiverWallet);
        // Buscar ultimas 20 txs (para no saturar)
        const sigInfos = await connection.getSignaturesForAddress(pubKey, { limit: 20 });

        for (const sigInfo of sigInfos) {
            if (sigInfo.err) continue;

            const tx = await connection.getParsedTransaction(sigInfo.signature, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0
            });

            if (!tx || !tx.meta) continue;

            // Busca el Log del Memo en los logs de la transacción (forma más rápida)
            const memoFound = tx.meta.logMessages?.some(log => log.includes(orderId));

            // O busca en instrucciones parseadas
            let memoInstrFound = false;
            // ... (simplificado para serverless: confiar en logMessages o parseo basico)

            // Si encontramos el memo (orderId) en los logs o instrucciones
            // Nota: Para robustez total se debe parsear profundamente, pero checking logs suele funcinar con spl-memo
            if (!memoFound && !JSON.stringify(tx).includes(orderId)) continue;

            // Verificar cambio de balance
            const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toString());
            const index = accountKeys.indexOf(receiverWallet);
            if (index === -1) continue;

            const pre = tx.meta.preBalances[index];
            const post = tx.meta.postBalances[index];
            const receivedSOL = (post - pre) / LAMPORTS_PER_SOL;

            if (receivedSOL + 0.000001 >= expectedSOL) {
                return { paid: true, signature: sigInfo.signature, receivedSOL };
            }
        }
        return { paid: false };
    } catch (e) {
        console.error("RPC Error:", e);
        return { paid: false };
    }
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { orderId } = req.query; // En Vercel query params vienen aqui
    if (!orderId) return res.status(400).json({ error: "Missing orderId" });

    try {
        // 1. Buscar orden en DB
        const { data: order, error } = await supabase
            .from('payment_orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (error || !order) return res.status(404).json({ error: "Order not found" });

        if (order.status === 'paid') {
            return res.json({ status: 'paid', order });
        }

        // 2. Verificar en Blockchain
        const result = await findPaymentByMemoAndAmount(order.wallet, order.amount_sol, orderId);

        if (result.paid) {
            // Actualizar DB
            await supabase
                .from('payment_orders')
                .update({
                    status: 'paid',
                    paid_at: new Date(),
                    signature: result.signature
                })
                .eq('id', orderId);

            return res.json({ status: 'paid', order: { ...order, status: 'paid' } });
        }

        return res.json({ status: 'pending', order });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
