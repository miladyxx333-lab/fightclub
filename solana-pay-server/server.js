import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import {
    Connection,
    PublicKey,
    LAMPORTS_PER_SOL
} from "@solana/web3.js";

const app = express();
app.use(express.json());
app.use(cors()); // Enable CORS for frontend access
const PORT = process.env.PORT || 3000;

// Cambia aquí si quieres otro RPC (procura uno confiable / propio)
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const connection = new Connection(SOLANA_RPC, "confirmed");

// Almacenaje simple en memoria (usa DB en producción)
const orders = new Map();

/** Helper: USD -> SOL usando CoinGecko */
async function usdToSol(usdAmount) {
    try {
        const url =
            "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";
        const res = await fetch(url);
        if (!res.ok) throw new Error("CoinGecko API error");
        const data = await res.json();
        const price = data.solana.usd;
        const sol = Number((usdAmount / price).toFixed(6)); // 6 decimales (ajustable)
        return { sol, price };
    } catch (e) {
        console.error("Price fetch error, using fallback fixed rate");
        // Fallback if API fails (rate limits common on public CG)
        // Assuming SOL ~200 for safe fallback to avoid crash, but backend should ideally retry
        return { sol: Number((usdAmount / 200).toFixed(6)), price: 200 };
    }
}

/** Genera link Solana Pay con memo único */
function generateSolanaPayLink({ wallet, amountSOL, label, message, orderId }) {
    const params = new URLSearchParams({
        amount: amountSOL.toString(),
        label: label || "CyberPollo Store",
        message: message || "CyberPollo Credits",
        memo: orderId
    });
    return `solana:${wallet}?${params.toString()}`;
}

/** Endpoint: crea orden y link (convierte USD->SOL) */
app.post("/api/create-payment", async (req, res) => {
    try {
        const { usd, wallet, label, message } = req.body;
        if (!usd || !wallet) return res.status(400).json({ error: "usd and wallet required" });

        const orderId = `ORDER_${Date.now()}_${uuidv4().slice(0, 6)}`;

        // Convertir USD -> SOL
        const { sol: amountSOL, price } = await usdToSol(Number(usd));

        const link = generateSolanaPayLink({
            wallet,
            amountSOL,
            label,
            message,
            orderId
        });

        const order = {
            orderId,
            wallet,
            label,
            message,
            usd: Number(usd),
            amountSOL,
            priceUSDperSOL: price,
            link,
            status: "pending",
            createdAt: Date.now()
        };

        orders.set(orderId, order);

        return res.json({ order });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
});

/** Helper: verifica una tx con memo === orderId y calcula cuánto recibió la wallet */
async function findPaymentByMemoAndAmount(receiverWallet, expectedSOL, orderId, lookback = 50) {
    try {
        const pubKey = new PublicKey(receiverWallet);

        // Obtener firmas recientes hacia la cuenta receptora
        const sigInfos = await connection.getSignaturesForAddress(pubKey, { limit: lookback });
        for (const sigInfo of sigInfos) {
            if (sigInfo.err) continue; // Skip failed txs

            const sig = sigInfo.signature;
            // Obtener transacción ya finalizada (si existe)
            const tx = await connection.getParsedTransaction(sig, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
            if (!tx || !tx.transaction) continue;

            // Buscar memo instruction (program === 'spl-memo')
            // En parsed transactions the memo may appear in message.instructions with program == 'spl-memo'
            const instrs = tx.transaction.message.instructions || [];
            const memoInstr = instrs.find(i => {
                // i.program puede ser 'spl-memo' o programId === 'MemoSq4gq...'
                return (i.program && i.program === "spl-memo") ||
                    (i.programId && i.programId.toString() === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
            });

            if (!memoInstr) continue;

            // parsed memo text puede estar en memoInstr.parsed o memoInstr.data
            const memoText = memoInstr.parsed || memoInstr.data || "";
            // Some rudimentary memo parsing if needed, but spl-memo is usually plain text
            if (!memoText || !memoText.toString().includes(orderId)) continue;

            // Encontrar index de la cuenta receptora en message.accountKeys
            const accountKeys = tx.transaction.message.accountKeys.map(k => (k.pubkey ? k.pubkey.toString() : k.toString()));
            const index = accountKeys.indexOf(receiverWallet);
            if (index === -1) continue;

            // postBalances y preBalances contienen lamports para cada account index
            const pre = tx.meta && tx.meta.preBalances ? tx.meta.preBalances[index] : null;
            const post = tx.meta && tx.meta.postBalances ? tx.meta.postBalances[index] : null;
            if (pre == null || post == null) continue;

            const receivedLamports = post - pre;
            const receivedSOL = receivedLamports / LAMPORTS_PER_SOL;

            // Si recibió al menos el esperado, confirmamos
            if (receivedSOL + 1e-9 >= expectedSOL) { // margen tiny
                return {
                    paid: true,
                    signature: sig,
                    receivedSOL,
                    slot: tx.slot
                };
            }
        }
        return { paid: false };
    } catch (e) {
        console.error("Verification Error:", e);
        return { paid: false, error: e.message };
    }
}

/** Endpoint: check payment status por orderId */
app.get("/api/check-payment/:orderId", async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = orders.get(orderId);
        if (!order) return res.status(404).json({ error: "Order not found" });

        if (order.status === "paid") return res.json({ order });

        // Verificar on-chain
        // Note: This is rate-limit intensive if polled frequently by many clients
        const verification = await findPaymentByMemoAndAmount(order.wallet, order.amountSOL, orderId, 20);
        if (verification.paid) {
            order.status = "paid";
            order.paidAt = Date.now();
            order.signature = verification.signature;
            order.receivedSOL = verification.receivedSOL;
            orders.set(orderId, order);
        }

        return res.json({ order, verification });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
});

/** Endpoint simple para listar órdenes (debug) */
app.get("/api/orders", (req, res) => {
    const arr = Array.from(orders.values());
    res.json(arr);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Endpoints: POST /api/create-payment  GET /api/check-payment/:orderId");
});
