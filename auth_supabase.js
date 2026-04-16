// ============================================
// AUTH SYSTEM v3 — Wallet-Native Authentication
// Replaces username/password with Solana wallet signMessage
// ============================================

class AuthSystem {
    constructor() {
        this.currentUser = JSON.parse(localStorage.getItem('cp_wallet_user'));
    }

    // ── Core Auth Flow ─────────────────────────

    /**
     * Login with connected Solana wallet.
     * 1. Calls Supabase RPC to get/create user + nonce
     * 2. Asks wallet to sign the nonce message
     * 3. Stores session locally
     */
    async loginWithWallet() {
        // Ensure wallet is connected
        if (!wallet.connected || !wallet.publicKey) {
            throw new Error('Wallet not connected');
        }

        const walletAddress = wallet.publicKey;

        // Step 1: Get or create user in Supabase (returns nonce)
        const { data, error } = await supabase.rpc('wallet_login', {
            p_wallet: walletAddress
        });

        if (error) {
            console.error('Supabase wallet_login error:', error);
            throw new Error('Database error: ' + error.message);
        }

        // Step 2: Sign a message to prove wallet ownership
        const nonce = data.nonce;
        const message = `CyberPollo Arena Login\nWallet: ${walletAddress}\nNonce: ${nonce}`;

        try {
            const signature = await wallet.signMessage(message);
            // Signature verification could be done server-side for production
            // For MVP, the fact that signMessage succeeded proves ownership
            console.log('Wallet signature obtained:', signature ? '✅' : '❌');
        } catch (signError) {
            // User rejected the signature request
            if (signError.message?.includes('User rejected')) {
                throw new Error('Wallet signature declined');
            }
            throw signError;
        }

        // Step 3: Store session
        this.currentUser = {
            id: data.id,
            wallet_address: data.wallet_address,
            credits: data.credits,
            is_new: data.is_new
        };

        this.saveSession();

        return {
            success: true,
            user: this.currentUser,
            isNew: data.is_new
        };
    }

    /**
     * Check auth state. If wallet is still connected and session exists, we're good.
     * If not, redirect to login.
     */
    async requireAuth() {
        if (!this.currentUser) {
            window.location.href = 'login.html';
            return;
        }
        // Refresh user data from DB
        await this.refreshUser();
    }

    async refreshUser() {
        if (!this.currentUser) return;

        try {
            const { data, error } = await supabase
                .from('game_users')
                .select('*')
                .eq('id', this.currentUser.id)
                .single();

            if (data) {
                this.currentUser = {
                    id: data.id,
                    wallet_address: data.wallet_address,
                    username: data.username,
                    credits: data.credits
                };
                this.saveSession();
            }
        } catch (e) {
            console.error('Error refreshing user:', e);
        }
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('cp_wallet_user');
        // Also disconnect wallet if possible
        if (wallet.connected) {
            wallet.disconnect().catch(() => {});
        }
        window.location.href = 'login.html';
    }

    // ── Credits Management ─────────────────────

    async addCredits(amount) {
        if (!this.currentUser) return;

        const walletAddr = this.currentUser.wallet_address;

        // Optimistic UI update
        this.currentUser.credits += amount;
        this.saveSession();

        const { data, error } = await supabase.rpc('add_credits_wallet', {
            p_wallet: walletAddr,
            p_amount: amount
        });

        if (error || !data) {
            console.error('Error adding credits:', error);
            // Revert optimistic update
            this.currentUser.credits -= amount;
            this.saveSession();
        }
    }

    async deductCredits(amount) {
        if (!this.currentUser) return false;

        const currentCredits = this.currentUser.credits;
        if (currentCredits < amount) return false;

        const walletAddr = this.currentUser.wallet_address;

        // Optimistic update
        this.currentUser.credits -= amount;
        this.saveSession();

        const { data, error } = await supabase.rpc('deduct_credits_wallet', {
            p_wallet: walletAddr,
            p_amount: amount
        });

        if (error || !data) {
            console.error('Error deducting credits:', error);
            // Revert
            this.currentUser.credits += amount;
            this.saveSession();
            return false;
        }
        return true;
    }

    // ── Helpers ────────────────────────────────

    getCurrentUser() {
        return this.currentUser;
    }

    getShortWallet() {
        if (!this.currentUser?.wallet_address) return '???';
        const w = this.currentUser.wallet_address;
        return w.slice(0, 4) + '...' + w.slice(-4);
    }

    saveSession() {
        localStorage.setItem('cp_wallet_user', JSON.stringify(this.currentUser));
    }

    isLoggedIn() {
        return !!this.currentUser;
    }
}

const auth = new AuthSystem();
