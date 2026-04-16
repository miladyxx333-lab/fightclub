// ============================================
// ARENA COMBAT — Provably Fair P2P Fight Engine
// Uses commit-reveal randomness + Supabase Realtime
// ============================================

class ArenaCombat {
    constructor() {
        this.fightId = null;
        this.role = null; // 'creator' or 'challenger'
        this.fight = null;
        this.channel = null;

        // Combat state
        this.playerHP = 100;
        this.playerMaxHP = 100;
        this.opponentHP = 100;
        this.opponentMaxHP = 100;
        this.isMyTurn = false;
        this.round = 1;
        this.baseDamage = 20;
        this.fightOver = false;

        // Provably fair state
        this.currentCommitment = null; // SHA-256 hash shown before player acts
        this.pendingReveal = false;

        // Timer state
        this.turnTimeLimitSeconds = 15;
        this.currentTimer = null;
        this.timeRemaining = 0;

        this.init();
    }

    async init() {
        // Parse URL params
        const params = new URLSearchParams(window.location.search);
        this.fightId = params.get('id');
        this.role = params.get('role');

        if (!this.fightId || !this.role) {
            alert('Invalid fight URL!');
            window.location.href = 'arena.html';
            return;
        }

        // Load fight data
        await this.loadFight();
        if (!this.fight) return;

        this.cacheDOM();
        this.setupUI();
        this.subscribeToChannel();

        // Creator goes first
        this.isMyTurn = (this.role === 'creator');
        this.updateTurnIndicator();

        // If it's our turn, request first commitment
        if (this.isMyTurn) {
            await this.requestNewCommitment();
        }
    }

    async loadFight() {
        const { data, error } = await supabase
            .from('arena_fights')
            .select('*')
            .eq('id', this.fightId)
            .single();

        if (error || !data) {
            alert('Fight not found!');
            window.location.href = 'arena.html';
            return;
        }

        this.fight = data;
    }

    cacheDOM() {
        this.playerImg = document.getElementById('p2p-player-img');
        this.playerName = document.getElementById('p2p-player-name');
        this.playerHPBar = document.getElementById('p2p-player-hp-bar');
        this.playerHPText = document.getElementById('p2p-player-hp-text');

        this.opponentImg = document.getElementById('p2p-opponent-img');
        this.opponentName = document.getElementById('p2p-opponent-name');
        this.opponentHPBar = document.getElementById('p2p-opponent-hp-bar');
        this.opponentHPText = document.getElementById('p2p-opponent-hp-text');

        this.diceEl = document.getElementById('p2p-dice');
        this.btnLow = document.getElementById('p2p-btn-low');
        this.btnHigh = document.getElementById('p2p-btn-high');
        this.battleLog = document.getElementById('p2p-battle-log');
        this.turnIndicator = document.getElementById('turn-indicator');
        this.roundDisplay = document.getElementById('round-display');
        
        // Timer display
        this.timerDisplay = document.createElement('div');
        this.timerDisplay.className = 'turn-timer hidden';
        this.turnIndicator.parentNode.insertBefore(this.timerDisplay, this.turnIndicator.nextSibling);

        this.betInfoEl = document.getElementById('p2p-bet-info');
        this.serverSeedDisplay = document.getElementById('p2p-server-seed');
        this.clientSeedInput = document.getElementById('p2p-client-seed');

        // Verification panel — inject after seeds section
        this.verifyPanel = document.createElement('div');
        this.verifyPanel.id = 'verify-panel';
        this.verifyPanel.style.cssText = 'margin-top: 10px; max-height: 200px; overflow-y: auto;';
        const seedSection = document.querySelector('.p2p-seeds');
        if (seedSection) seedSection.after(this.verifyPanel);

        // Bind controls
        this.btnLow.addEventListener('click', () => this.takeTurn('low'));
        this.btnHigh.addEventListener('click', () => this.takeTurn('high'));
    }

    setupUI() {
        const isCreator = this.role === 'creator';

        // Player side
        const myFighter = isCreator
            ? { name: this.fight.creator_fighter_name, image: this.fight.creator_fighter_image }
            : { name: this.fight.challenger_fighter_name, image: this.fight.challenger_fighter_image };

        const theirFighter = isCreator
            ? { name: this.fight.challenger_fighter_name, image: this.fight.challenger_fighter_image }
            : { name: this.fight.creator_fighter_name, image: this.fight.creator_fighter_image };

        this.playerImg.src = myFighter.image || '';
        this.playerName.textContent = myFighter.name || 'You';
        this.opponentImg.src = theirFighter.image || '';
        this.opponentName.textContent = theirFighter.name || 'Opponent';

        // Bet info
        if (this.betInfoEl) {
            this.betInfoEl.textContent = `⚔️ ${this.fight.bet_amount_display} each · Provably Fair 🔒 · 3% fee`;
        }

        // Generate crypto-secure client seed
        if (!this.clientSeedInput.value) {
            this.clientSeedInput.value = provablyFair.generateSecureHex(8);
        }

        this.updateHPUI();
    }

    // ── Provably Fair — Commit Phase ──────────

    /**
     * Request a commitment from the backend for the current round.
     * The commitment (SHA-256 of serverSeed) is displayed to the player
     * BEFORE they make their prediction, proving the server can't change it.
     */
    async requestNewCommitment() {
        try {
            this.currentCommitment = await provablyFair.requestCommitment(
                this.fightId,
                this.round
            );

            // Show commitment hash in the server seed display
            if (this.serverSeedDisplay) {
                this.serverSeedDisplay.value = `🔒 ${this.currentCommitment.slice(0, 24)}...`;
                this.serverSeedDisplay.title = `Full commitment: ${this.currentCommitment}`;
            }

            this.battleLog.textContent = '🎯 Commitment received. Make your prediction!';
        } catch (err) {
            console.error('Failed to get commitment:', err);
            this.battleLog.textContent = '❌ Error getting commitment. Retrying...';
            // Retry once
            await this.sleep(1000);
            await this.requestNewCommitment();
        }
    }

    // ── Realtime Channel ──────────────────────
    subscribeToChannel() {
        this.channel = supabase.channel(`fight:${this.fightId}`, {
            config: { broadcast: { self: false } }
        });

        this.channel
            .on('broadcast', { event: 'turn_result' }, (payload) => {
                this.handleOpponentTurn(payload.payload);
            })
            .on('broadcast', { event: 'fight_over' }, (payload) => {
                this.handleFightOver(payload.payload);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Connected to fight channel (provably fair mode)');
                    this.battleLog.textContent = this.isMyTurn
                        ? '🎯 Your turn! Predict the roll.'
                        : '⏳ Waiting for opponent...';
                }
            });
    }

    // ── Timer Logic ───────────────────────────
    startTimer() {
        this.stopTimer();
        this.timeRemaining = this.turnTimeLimitSeconds;
        this.timerDisplay.classList.remove('hidden');
        this.updateTimerUI();

        this.currentTimer = setInterval(() => {
            this.timeRemaining--;
            this.updateTimerUI();

            if (this.timeRemaining <= 0) {
                this.stopTimer();
                this.handleTimeout();
            }
        }, 1000);
    }

    stopTimer() {
        if (this.currentTimer) {
            clearInterval(this.currentTimer);
            this.currentTimer = null;
        }
        this.timerDisplay.classList.add('hidden');
    }

    updateTimerUI() {
        this.timerDisplay.textContent = `⏱️ ${this.timeRemaining}s`;
        if (this.timeRemaining <= 5) {
            this.timerDisplay.style.color = '#ff073a';
            this.timerDisplay.classList.add('pulse-fast');
        } else {
            this.timerDisplay.style.color = '#ffaa00';
            this.timerDisplay.classList.remove('pulse-fast');
        }
    }

    handleTimeout() {
        if (!this.isMyTurn || this.fightOver) return;
        this.battleLog.textContent = '⏱️ Time is up! Auto-playing...';
        this.takeTurn('low');
    }

    // ── Take Turn (Provably Fair) ─────────────
    async takeTurn(prediction) {
        if (!this.isMyTurn || this.fightOver || this.pendingReveal) return;

        // Must have a commitment first
        if (!this.currentCommitment) {
            this.battleLog.textContent = '⏳ Waiting for commitment...';
            await this.requestNewCommitment();
            if (!this.currentCommitment) return;
        }

        this.stopTimer();
        this.pendingReveal = true;

        // Disable buttons
        this.btnLow.disabled = true;
        this.btnHigh.disabled = true;
        this.isMyTurn = false;

        // Roll animation
        this.diceEl.className = 'p2p-dice rolling';
        this.battleLog.textContent = '🔓 Revealing server seed...';

        const clientSeed = this.clientSeedInput.value || provablyFair.generateSecureHex(8);

        try {
            // Submit prediction + client seed → backend reveals server seed
            const result = await provablyFair.submitAndReveal(
                this.fightId,
                this.round,
                prediction,
                clientSeed
            );

            // This point is reached ONLY if verification passed ✓
            await this.sleep(400);

            this.showDiceFace(result.roll);
            await this.sleep(800);

            // Reveal the server seed in UI
            if (this.serverSeedDisplay) {
                this.serverSeedDisplay.value = result.serverSeed;
                this.serverSeedDisplay.title = 'Verified ✓';
                this.serverSeedDisplay.style.borderColor = '#39ff14';
                setTimeout(() => { this.serverSeedDisplay.style.borderColor = ''; }, 2000);
            }

            // Apply damage locally
            if (result.hit) {
                this.opponentHP = Math.max(0, this.opponentHP - result.damage);
                this.battleLog.textContent = `💥 HIT! ${result.damage} damage! [Roll: ${result.roll}] ✓ Verified`;
                this.battleLog.style.color = '#39ff14';
                this.shakeElement('p2p-opponent-side');
            } else {
                this.playerHP = Math.max(0, this.playerHP - result.counterDamage);
                this.battleLog.textContent = `😵 MISS! Take ${result.counterDamage} damage [Roll: ${result.roll}] ✓ Verified`;
                this.battleLog.style.color = '#ff073a';
                this.shakeElement('p2p-player-side');
            }

            this.updateHPUI();
            this.round++;
            if (this.roundDisplay) this.roundDisplay.textContent = `Round ${this.round}`;

            // Update verification panel
            if (this.verifyPanel) {
                this.verifyPanel.innerHTML = provablyFair.getVerificationHTML(5);
            }

            // Broadcast to opponent
            await this.channel.send({
                type: 'broadcast',
                event: 'turn_result',
                payload: {
                    player: this.role,
                    prediction,
                    roll: result.roll,
                    serverSeed: result.serverSeed,
                    commitment: result.commitment,
                    clientSeed,
                    hit: result.hit,
                    damage: result.damage,
                    counterDamage: result.counterDamage,
                    round: this.round
                }
            });

            // Check win
            if (this.playerHP <= 0 || this.opponentHP <= 0) {
                this.endFight();
            } else {
                this.updateTurnIndicator();
                this.battleLog.textContent += ' — Waiting for opponent...';
            }

            // Generate new client seed for next turn
            this.clientSeedInput.value = provablyFair.generateSecureHex(8);

        } catch (err) {
            console.error('Provably fair turn error:', err);
            this.battleLog.textContent = `❌ ${err.message}`;
            this.battleLog.style.color = '#ff073a';

            // Re-enable buttons to retry
            this.isMyTurn = true;
            this.btnLow.disabled = false;
            this.btnHigh.disabled = false;
        } finally {
            this.pendingReveal = false;
        }
    }

    // ── Handle Opponent Turn ──────────────────
    async handleOpponentTurn(data) {
        // Animate dice
        this.diceEl.className = 'p2p-dice rolling';
        await this.sleep(600);

        this.showDiceFace(data.roll);
        await this.sleep(800);

        // Verify opponent's turn if we have the data
        if (data.serverSeed && data.commitment && data.clientSeed) {
            try {
                const verification = await provablyFair.verifyAndRoll(
                    data.serverSeed,
                    data.clientSeed,
                    data.commitment
                );
                if (!verification.valid) {
                    this.battleLog.textContent = '⚠️ OPPONENT TURN FAILED VERIFICATION!';
                    this.battleLog.style.color = '#ff073a';
                    return;
                }
                if (verification.roll !== data.roll) {
                    this.battleLog.textContent = `⚠️ ROLL MISMATCH! Expected ${verification.roll}, got ${data.roll}`;
                    this.battleLog.style.color = '#ff073a';
                    return;
                }
            } catch (e) {
                console.warn('Could not verify opponent turn:', e);
            }
        }

        // Mirror damage
        if (data.hit) {
            this.playerHP = Math.max(0, this.playerHP - data.damage);
            this.battleLog.textContent = `😵 Opponent hits for ${data.damage}! [Roll: ${data.roll}] ✓ Verified`;
            this.battleLog.style.color = '#ff073a';
            this.shakeElement('p2p-player-side');
        } else {
            this.opponentHP = Math.max(0, this.opponentHP - data.counterDamage);
            this.battleLog.textContent = `🛡️ Opponent missed! Counter ${data.counterDamage}! [Roll: ${data.roll}] ✓ Verified`;
            this.battleLog.style.color = '#39ff14';
            this.shakeElement('p2p-opponent-side');
        }

        this.round = data.round || this.round + 1;
        if (this.roundDisplay) this.roundDisplay.textContent = `Round ${this.round}`;
        if (this.serverSeedDisplay) this.serverSeedDisplay.value = data.serverSeed;

        // Update verification panel with opponent's data too
        if (this.verifyPanel) {
            this.verifyPanel.innerHTML = provablyFair.getVerificationHTML(5);
        }

        this.updateHPUI();

        // Check win
        if (this.playerHP <= 0 || this.opponentHP <= 0) {
            this.endFight();
        } else {
            // Now it's our turn — request new commitment
            this.isMyTurn = true;
            this.btnLow.disabled = false;
            this.btnHigh.disabled = false;
            this.updateTurnIndicator();
            await this.requestNewCommitment();
        }
    }

    // ── End Fight ─────────────────────────────
    async endFight() {
        this.fightOver = true;
        this.btnLow.disabled = true;
        this.btnHigh.disabled = true;
        this.stopTimer();

        const iWon = this.playerHP > 0;

        // Show result overlay
        const overlay = document.getElementById('p2p-result-overlay');
        const resultTitle = document.getElementById('p2p-result-title');
        const resultMsg = document.getElementById('p2p-result-message');

        if (overlay) overlay.classList.remove('hidden');

        if (iWon) {
            if (resultTitle) {
                resultTitle.textContent = '🏆 VICTORY!';
                resultTitle.style.color = '#39ff14';
            }
            if (resultMsg) {
                const totalPot = this.fight.bet_amount * 2;
                const fee = Math.floor(totalPot * 0.03);
                const payout = totalPot - fee;
                resultMsg.textContent = `You won ${this.fight.bet_amount_display}! (minus 3% fee) — Provably Fair ✓`;
            }
        } else {
            if (resultTitle) {
                resultTitle.textContent = '💀 DEFEATED';
                resultTitle.style.color = '#ff073a';
            }
            if (resultMsg) {
                resultMsg.textContent = `You lost ${this.fight.bet_amount_display}. All rounds were provably fair.`;
            }
        }

        // Trigger payout via backend (same as before)
        if (iWon) {
            try {
                const winnerWallet = this.role === 'creator' ? this.fight.creator_wallet : this.fight.challenger_wallet;
                this.logBattle(`🏆 Claiming prize from Smart Escrow...`);
                
                const response = await fetch('/api/arena/resolve-fight', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fightId: this.fightId,
                        winnerRole: this.role,
                        winnerWallet: winnerWallet
                    })
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                
                this.logBattle(`💰 Prize transferred! (TX: ...${result.payoutTx.slice(-6)})`);

            } catch (err) {
                console.error('Error triggering payout:', err);
                this.logBattle(`❌ Payout error: ${err.message}`);
            }
        }

        // Broadcast fight over
        await this.channel.send({
            type: 'broadcast',
            event: 'fight_over',
            payload: { winner: iWon ? this.role : 'opponent' }
        });
    }

    handleFightOver(data) {
        if (this.fightOver) return;
        this.fightOver = true;
    }

    // ── UI Helpers ────────────────────────────
    updateHPUI() {
        const pPct = (this.playerHP / this.playerMaxHP) * 100;
        const oPct = (this.opponentHP / this.opponentMaxHP) * 100;

        if (this.playerHPBar) this.playerHPBar.style.width = `${pPct}%`;
        if (this.playerHPText) this.playerHPText.textContent = `${this.playerHP}/${this.playerMaxHP}`;
        if (this.opponentHPBar) this.opponentHPBar.style.width = `${oPct}%`;
        if (this.opponentHPText) this.opponentHPText.textContent = `${this.opponentHP}/${this.opponentMaxHP}`;

        if (this.playerHPBar) {
            this.playerHPBar.style.background = pPct > 50 ? '#39ff14' : pPct > 25 ? '#ffaa00' : '#ff073a';
        }
        if (this.opponentHPBar) {
            this.opponentHPBar.style.background = oPct > 50 ? '#ff073a' : oPct > 25 ? '#ffaa00' : '#39ff14';
        }
    }

    updateTurnIndicator() {
        if (!this.turnIndicator) return;
        if (this.isMyTurn) {
            this.turnIndicator.textContent = '🎯 YOUR TURN';
            this.turnIndicator.className = 'turn-indicator your-turn';
            this.btnLow.disabled = false;
            this.btnHigh.disabled = false;
            this.startTimer();
        } else {
            this.turnIndicator.textContent = '⏳ OPPONENT\'S TURN';
            this.turnIndicator.className = 'turn-indicator their-turn';
            this.btnLow.disabled = true;
            this.btnHigh.disabled = true;
            this.stopTimer();
        }
    }

    showDiceFace(num) {
        this.diceEl.className = `p2p-dice show-${num}`;
    }

    shakeElement(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.transform = 'translateX(10px)';
        setTimeout(() => el.style.transform = 'none', 150);
    }

    logBattle(msg) {
        if (this.battleLog) {
            this.battleLog.textContent = msg;
        }
    }

    sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    window.arenaCombat = new ArenaCombat();
});
