// ============================================
// PROVABLY FAIR ENGINE — Commit-Reveal Randomness
// ============================================
//
// Replaces the insecure Math.random() dice system with
// a cryptographic commit-reveal scheme:
//
// 1. SERVER generates a random serverSeed and publishes
//    its SHA-256 hash (commitment) BEFORE the player acts.
// 2. PLAYER submits their prediction + clientSeed.
// 3. SERVER reveals the serverSeed. Both sides verify:
//    SHA-256(serverSeed) === commitment
// 4. Roll = SHA-256(serverSeed + clientSeed) mod 6 + 1
//
// Neither side can manipulate the outcome because:
// - Server committed to its seed before seeing the client seed
// - Client seed was chosen before seeing the server seed
//
// For solo mode: the backend API handles commit/reveal.
// For P2P arena: the backend acts as a trusted dealer per turn.
// ============================================

class ProvablyFairEngine {
    constructor() {
        // Verification history for transparency panel
        this.history = [];
    }

    // ── Cryptographic Primitives ──────────────

    /**
     * Generate a cryptographically secure random hex string.
     * Uses crypto.getRandomValues() instead of Math.random().
     */
    generateSecureHex(byteCount = 32) {
        const bytes = new Uint8Array(byteCount);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * SHA-256 hash of a string. Returns hex.
     */
    async sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Derive a dice roll (1-6) from serverSeed + clientSeed.
     * Deterministic: same inputs always produce same output.
     */
    async calculateRoll(serverSeed, clientSeed) {
        const combined = serverSeed + ':' + clientSeed;
        const hash = await this.sha256(combined);
        // Use first 8 hex chars (32 bits) as the roll source
        const num = parseInt(hash.substring(0, 8), 16);
        return (num % 6) + 1;
    }

    // ── Commit-Reveal Flow ────────────────────

    /**
     * SERVER SIDE: Generate a commitment (called by backend API).
     * Returns { serverSeed, commitment }
     */
    async createCommitment() {
        const serverSeed = this.generateSecureHex(32);
        const commitment = await this.sha256(serverSeed);
        return { serverSeed, commitment };
    }

    /**
     * CLIENT SIDE: Verify that a revealed server seed matches its commitment.
     */
    async verifyCommitment(serverSeed, commitment) {
        const computed = await this.sha256(serverSeed);
        return computed === commitment;
    }

    /**
     * Full verification: checks commitment AND computes the roll.
     * Returns { valid, roll, hash } or { valid: false, error }
     */
    async verifyAndRoll(serverSeed, clientSeed, commitment) {
        // Step 1: Verify commitment
        const isValid = await this.verifyCommitment(serverSeed, commitment);
        if (!isValid) {
            return { valid: false, error: 'Commitment verification failed! Server seed does not match.' };
        }

        // Step 2: Calculate roll
        const roll = await this.calculateRoll(serverSeed, clientSeed);
        const hash = await this.sha256(serverSeed + ':' + clientSeed);

        // Step 3: Record for transparency
        this.history.push({
            timestamp: Date.now(),
            serverSeed,
            clientSeed,
            commitment,
            roll,
            hash,
            verified: true
        });

        return { valid: true, roll, hash };
    }

    // ── Backend API Integration ───────────────

    /**
     * Request a new commitment from the backend.
     * The backend generates a serverSeed, stores it, and returns the hash.
     */
    async requestCommitment(fightId, round) {
        const response = await fetch('/api/arena/commit-round', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fightId, round })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to get commitment');
        }

        const data = await response.json();
        return data.commitment; // SHA-256 hash of serverSeed
    }

    /**
     * Submit prediction and client seed, receive the reveal.
     * Backend reveals its serverSeed so both sides can verify.
     */
    async submitAndReveal(fightId, round, prediction, clientSeed) {
        const response = await fetch('/api/arena/reveal-round', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fightId, round, prediction, clientSeed })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to reveal round');
        }

        const data = await response.json();
        // data = { serverSeed, commitment, roll, hit, damage, counterDamage }

        // Verify locally
        const verification = await this.verifyAndRoll(
            data.serverSeed,
            clientSeed,
            data.commitment
        );

        if (!verification.valid) {
            throw new Error('⚠️ VERIFICATION FAILED: ' + verification.error);
        }

        // Double-check roll matches
        if (verification.roll !== data.roll) {
            throw new Error(`⚠️ ROLL MISMATCH: Local=${verification.roll}, Server=${data.roll}`);
        }

        return data;
    }

    // ── Standalone Mode (Solo Combat) ─────────
    // For the solo game mode (combat_engine.js), we can use
    // a client-only commit-reveal where we self-commit.
    // This is less secure but still better than Math.random().

    /**
     * Generate a pre-committed round for solo play.
     * The commitment is shown BEFORE the player predicts.
     */
    async prepareSoloRound() {
        const serverSeed = this.generateSecureHex(32);
        const commitment = await this.sha256(serverSeed);
        return {
            serverSeed,      // Hidden until after prediction
            commitment,      // Shown to player before they act
        };
    }

    // ── Verification UI Helper ────────────────

    /**
     * Generate an HTML verification panel showing the last N rounds.
     */
    getVerificationHTML(lastN = 5) {
        const recent = this.history.slice(-lastN).reverse();
        if (recent.length === 0) return '<p style="color:#666;">No rounds yet.</p>';

        return recent.map((r, i) => `
            <div class="verify-round" style="
                background: rgba(0,0,0,0.3);
                padding: 10px;
                border-radius: 8px;
                margin-bottom: 8px;
                border-left: 3px solid ${r.verified ? '#39ff14' : '#ff073a'};
                font-family: monospace;
                font-size: 0.75rem;
            ">
                <div style="color: #aaa;">Round ${this.history.length - i}</div>
                <div>🎲 Roll: <strong style="color:#fff;">${r.roll}</strong></div>
                <div style="color:#888;">Server: ${r.serverSeed.slice(0, 16)}...</div>
                <div style="color:#888;">Client: ${r.clientSeed.slice(0, 16)}...</div>
                <div style="color:#888;">Commit: ${r.commitment.slice(0, 16)}...</div>
                <div style="color: ${r.verified ? '#39ff14' : '#ff073a'};">
                    ${r.verified ? '✓ Verified' : '✗ FAILED'}
                </div>
            </div>
        `).join('');
    }
}

// ── Global Instance ──
const provablyFair = new ProvablyFairEngine();
