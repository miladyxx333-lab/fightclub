// ============================================
// WALLET ADAPTER — Phantom / Solflare / Backpack
// Handles Solana wallet connection for the Arena
// ============================================

class WalletAdapter {
    constructor() {
        this.provider = null;
        this.publicKey = null;
        this.connected = false;
        this.listeners = [];
    }

    // Detect available wallet
    getProvider() {
        if (window.phantom?.solana?.isPhantom) {
            return window.phantom.solana;
        }
        if (window.solflare?.isSolflare) {
            return window.solflare;
        }
        if (window.backpack) {
            return window.backpack;
        }
        return null;
    }

    async connect() {
        const provider = this.getProvider();

        if (!provider) {
            // Open Phantom download page
            window.open('https://phantom.app/', '_blank');
            throw new Error('No Solana wallet found. Please install Phantom.');
        }

        try {
            const resp = await provider.connect();
            this.provider = provider;
            this.publicKey = resp.publicKey.toString();
            this.connected = true;

            // Listen for disconnect
            provider.on('disconnect', () => {
                this.publicKey = null;
                this.connected = false;
                this._emit('disconnect');
            });

            // Listen for account change
            provider.on('accountChanged', (newPublicKey) => {
                if (newPublicKey) {
                    this.publicKey = newPublicKey.toString();
                    this._emit('accountChanged', this.publicKey);
                } else {
                    this.disconnect();
                }
            });

            this._emit('connect', this.publicKey);
            return this.publicKey;
        } catch (err) {
            console.error('Wallet connection failed:', err);
            throw err;
        }
    }

    async disconnect() {
        if (this.provider) {
            await this.provider.disconnect();
        }
        this.provider = null;
        this.publicKey = null;
        this.connected = false;
        this._emit('disconnect');
    }

    // Get shortened wallet address for display
    getShortAddress() {
        if (!this.publicKey) return '';
        return this.publicKey.slice(0, 4) + '...' + this.publicKey.slice(-4);
    }

    // Sign a transaction (for sending tokens)
    async signAndSendTransaction(transaction) {
        if (!this.provider || !this.connected) {
            throw new Error('Wallet not connected');
        }
        const { signature } = await this.provider.signAndSendTransaction(transaction);
        return signature;
    }

    // Sign a message (for auth verification)
    async signMessage(message) {
        if (!this.provider || !this.connected) {
            throw new Error('Wallet not connected');
        }
        const encodedMessage = new TextEncoder().encode(message);
        const { signature } = await this.provider.signMessage(encodedMessage, 'utf8');
        return signature;
    }

    // ── Solana Web3 Transaction (P2P Arena Escrow) ──
    async sendBetTransaction(lamportsAmount) {
        if (!this.provider || !this.connected) {
            throw new Error('Wallet not connected');
        }
        
        // Use global solanaWeb3 loaded from CDN
        if (typeof solanaWeb3 === 'undefined') {
            throw new Error('Solana Web3 SDK not loaded on this page.');
        }

        const { Connection, PublicKey, SystemProgram, Transaction } = solanaWeb3;
        
        // This should probably be an endpoint, but for MVP we hardcode standard RPC
        const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
        const fromPubkey = new PublicKey(this.publicKey);
        const toPubkey = new PublicKey('e6uU5apmNZrUX4L2fCZ7hupZMwofS3JUNXEHcSxqcBD'); // House Wallet

        // 1. Get latest blockhash
        const latestBlockhash = await connection.getLatestBlockhash('confirmed');

        // 2. Create Simple SOL Transfer Transaction
        // For SPL Tokens, we would use createTransferInstruction from @solana/spl-token,
        // but for now we'll stick to native SOL transfers for the MVP
        const transaction = new Transaction({
            recentBlockhash: latestBlockhash.blockhash,
            feePayer: fromPubkey
        }).add(
            SystemProgram.transfer({
                fromPubkey,
                toPubkey,
                lamports: lamportsAmount,
            })
        );

        // 3. Request Signature from Wallet
        const { signature } = await this.provider.signAndSendTransaction(transaction);
        
        // Return transaction signature for the backend API
        return signature;
    }

    // Event system
    on(event, callback) {
        this.listeners.push({ event, callback });
    }

    _emit(event, data) {
        this.listeners
            .filter(l => l.event === event)
            .forEach(l => l.callback(data));
    }
}

// Global instance
const wallet = new WalletAdapter();
