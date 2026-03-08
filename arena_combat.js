// ============================================
// ARENA COMBAT — Real-time P2P Fight Engine
// Uses Supabase Realtime Broadcast for turn sync
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
        
        // Add timer display dynamically to the header
        this.timerDisplay = document.createElement('div');
        this.timerDisplay.className = 'turn-timer hidden';
        this.turnIndicator.parentNode.insertBefore(this.timerDisplay, this.turnIndicator.nextSibling);

        this.betInfoEl = document.getElementById('p2p-bet-info');

        this.serverSeedDisplay = document.getElementById('p2p-server-seed');
        this.clientSeedInput = document.getElementById('p2p-client-seed');

        // Bind controls
        this.btnLow.addEventListener('click', () => this.takeTurn('low'));
        this.btnHigh.addEventListener('click', () => this.takeTurn('high'));
    }

    setupUI() {
        const isCreator = this.role === 'creator';

        // Player side (always shows YOUR fighter)
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
            this.betInfoEl.textContent = `⚔️ ${this.fight.bet_amount_display} each · Winner takes all (minus 3% fee)`;
        }

        // Default client seed
        if (!this.clientSeedInput.value) {
            this.clientSeedInput.value = this.generateRandomHex(8);
        }

        this.updateHPUI();
    }

    // ── Realtime Channel ──────────────────────
    subscribeToChannel() {
        this.channel = supabase.channel(`fight:${this.fightId}`, {
            config: { broadcast: { self: false } } // Don't echo back to sender
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
                    console.log('Connected to fight channel');
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
        // Auto-play a turn (defaulting to 'low' as a penalty for being afk)
        this.takeTurn('low');
    }

    // ── Take Turn ─────────────────────────────
    async takeTurn(prediction) {
        if (!this.isMyTurn || this.fightOver) return;

        // Stop the timer as soon as an action is taken
        this.stopTimer();

        // Disable buttons
        this.btnLow.disabled = true;
        this.btnHigh.disabled = true;
        this.isMyTurn = false;

        // Roll animation
        this.diceEl.className = 'p2p-dice rolling';
        await this.sleep(600);

        // Deterministic roll
        const serverSeed = this.generateRandomHex(32);
        const clientSeed = this.clientSeedInput.value || 'default';
        const roll = this.calculateRoll(serverSeed, clientSeed);

        this.showDiceFace(roll);
        await this.sleep(800);

        // Determine result
        const isLow = roll <= 3;
        const isHigh = roll >= 4;
        const hit = (prediction === 'low' && isLow) || (prediction === 'high' && isHigh);

        const crit = (roll === 1 || roll === 6) ? 1.5 : 1;
        const damage = hit ? Math.floor(this.baseDamage * crit) : 0;
        const counterDamage = hit ? 0 : Math.floor(this.baseDamage * 0.8);

        // Apply locally
        if (hit) {
            this.opponentHP = Math.max(0, this.opponentHP - damage);
            this.battleLog.textContent = `💥 HIT! You deal ${damage} damage!`;
            this.battleLog.style.color = '#39ff14';
            this.shakeElement('p2p-opponent-side');
        } else {
            this.playerHP = Math.max(0, this.playerHP - counterDamage);
            this.battleLog.textContent = `😵 MISS! You take ${counterDamage} damage!`;
            this.battleLog.style.color = '#ff073a';
            this.shakeElement('p2p-player-side');
        }

        this.updateHPUI();
        this.round++;
        if (this.roundDisplay) this.roundDisplay.textContent = `Round ${this.round}`;

        // Reveal server seed
        if (this.serverSeedDisplay) {
            this.serverSeedDisplay.value = serverSeed;
        }

        // Broadcast to opponent
        await this.channel.send({
            type: 'broadcast',
            event: 'turn_result',
            payload: {
                player: this.role,
                prediction,
                roll,
                serverSeed,
                hit,
                damage,
                counterDamage,
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
    }

    // ── Handle Opponent Turn ──────────────────
    async handleOpponentTurn(data) {
        // Animate dice
        this.diceEl.className = 'p2p-dice rolling';
        await this.sleep(600);

        this.showDiceFace(data.roll);
        await this.sleep(800);

        // Mirror: if opponent hit, WE take damage
        if (data.hit) {
            this.playerHP = Math.max(0, this.playerHP - data.damage);
            this.battleLog.textContent = `😵 Opponent hits you for ${data.damage} damage!`;
            this.battleLog.style.color = '#ff073a';
            this.shakeElement('p2p-player-side');
        } else {
            this.opponentHP = Math.max(0, this.opponentHP - data.counterDamage);
            this.battleLog.textContent = `🛡️ Opponent missed! You counter for ${data.counterDamage}!`;
            this.battleLog.style.color = '#39ff14';
            this.shakeElement('p2p-opponent-side');
        }

        this.round = data.round || this.round + 1;
        if (this.roundDisplay) this.roundDisplay.textContent = `Round ${this.round}`;
        if (this.serverSeedDisplay) this.serverSeedDisplay.value = data.serverSeed;

        this.updateHPUI();

        // Check win
        if (this.playerHP <= 0 || this.opponentHP <= 0) {
            this.endFight();
        } else {
            // Now it's our turn
            this.isMyTurn = true;
            this.btnLow.disabled = false;
            this.btnHigh.disabled = false;
            this.updateTurnIndicator();
            this.battleLog.textContent += ' — Your turn!';
        }
    }

    // ── End Fight ─────────────────────────────
    async endFight() {
        this.fightOver = true;
        this.btnLow.disabled = true;
        this.btnHigh.disabled = true;

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
                resultMsg.textContent = `You won ${this.fight.bet_amount_display}! (minus 3% fee)`;
            }
        } else {
            if (resultTitle) {
                resultTitle.textContent = '💀 DEFEATED';
                resultTitle.style.color = '#ff073a';
            }
            if (resultMsg) {
                resultMsg.textContent = `You lost ${this.fight.bet_amount_display}. Better luck next time!`;
            }
        }

        // Update fight record and trigger payout via Backend API
        if (iWon) {
            try {
                const winnerWallet = this.role === 'creator' ? this.fight.creator_wallet : this.fight.challenger_wallet;
                this.logBattle(`🏆 Reclamando fondo de premios al Smart Escrow...`);
                
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
                
                this.logBattle(`💰 ¡Premio transferido exitosamente! (TX: ...${result.payoutTx.slice(-6)})`);

            } catch (err) {
                console.error('Error triggering payout via backend:', err);
                this.logBattle(`❌ Error interno dispersando pago: ${err.message}`);
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
        // Opponent already declared the result
        // UI was already updated from the last turn
    }

    // ── UI Helpers ────────────────────────────
    updateHPUI() {
        const pPct = (this.playerHP / this.playerMaxHP) * 100;
        const oPct = (this.opponentHP / this.opponentMaxHP) * 100;

        if (this.playerHPBar) this.playerHPBar.style.width = `${pPct}%`;
        if (this.playerHPText) this.playerHPText.textContent = `${this.playerHP}/${this.playerMaxHP}`;
        if (this.opponentHPBar) this.opponentHPBar.style.width = `${oPct}%`;
        if (this.opponentHPText) this.opponentHPText.textContent = `${this.opponentHP}/${this.opponentMaxHP}`;

        // Color transitions
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

    // ── Deterministic Roll ────────────────────
    calculateRoll(serverSeed, clientSeed) {
        const combined = serverSeed + clientSeed;
        let hashVal = 0;
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i);
            hashVal = ((hashVal << 5) - hashVal) + char;
            hashVal = hashVal & hashVal;
        }
        return (Math.abs(hashVal) % 6) + 1;
    }

    generateRandomHex(length) {
        let result = '';
        const chars = '0123456789abcdef';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    window.arenaCombat = new ArenaCombat();
});
