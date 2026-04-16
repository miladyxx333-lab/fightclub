// ============================================
// COMBAT ENGINE — Solo Mode (Provably Fair)
// ============================================
//
// Uses the ProvablyFairEngine for commit-reveal dice rolls.
// In solo mode, the commit/reveal is self-contained (client-side)
// since there's no opponent to cheat against — it's PvE.
// The commitment is still shown for transparency.

class CombatSession {
    constructor(playerFighter, opponentFighter, riskMultiplier, gameInstance) {
        this.player = playerFighter;
        this.opponent = opponentFighter;
        this.game = gameInstance;

        // Stats
        this.playerHP = 100;
        this.playerMaxHP = 100;
        // Risk scales opponent HP and Damage
        this.opponentHP = 100 + (riskMultiplier * 5);
        this.opponentMaxHP = this.opponentHP;

        this.baseDamage = 20;

        // UI Elements
        this.interactionArea = document.getElementById('combat-interaction-area');
        this.diceEl = document.getElementById('dice');
        this.btnLow = document.getElementById('btn-low');
        this.btnHigh = document.getElementById('btn-high');

        this.playerHPBar = document.getElementById('player-hp-bar');
        this.playerHPText = document.getElementById('player-hp-text');
        this.opponentHPBar = document.getElementById('opponent-hp-bar');
        this.opponentHPText = document.getElementById('opponent-hp-text');

        // Seeds
        this.serverSeedInput = document.getElementById('server-seed-display');
        this.clientSeedInput = document.getElementById('client-seed-input');

        this.battleLog = document.getElementById('battle-log');
        this.vsOverlay = document.getElementById('vs-overlay');

        // Provably fair state
        this.currentRound = null; // { serverSeed, commitment }

        this.init();
    }

    async init() {
        this.vsOverlay.classList.add('hidden');
        this.interactionArea.classList.remove('hidden');
        this.battleLog.textContent = t('turnStart');
        this.updateHPUI();

        // Generate crypto-secure client seed
        if (!this.clientSeedInput.value) {
            this.clientSeedInput.value = provablyFair.generateSecureHex(8);
        }

        await this.prepareTurn();

        // Bind Controls
        this.boundLow = () => this.handleTurn('low');
        this.boundHigh = () => this.handleTurn('high');

        this.btnLow.onclick = this.boundLow;
        this.btnHigh.onclick = this.boundHigh;
        this.btnLow.disabled = false;
        this.btnHigh.disabled = false;

        // Reset dice visual
        this.diceEl.className = 'dice';
    }

    async prepareTurn() {
        // Generate commitment for this round
        this.currentRound = await provablyFair.prepareSoloRound();

        // Show commitment hash (proves server can't change seed after player acts)
        this.serverSeedInput.value = `🔒 ${this.currentRound.commitment.slice(0, 24)}...`;
        this.serverSeedInput.title = `Commitment: ${this.currentRound.commitment}`;
    }

    async handleTurn(prediction) {
        // Disable buttons
        this.btnLow.disabled = true;
        this.btnHigh.disabled = true;

        // Roll Dice Animation
        this.diceEl.className = 'dice rolling';

        // Wait for visual roll
        await new Promise(r => setTimeout(r, 600));

        // --- Provably Fair Outcome ---
        const clientSeed = this.clientSeedInput.value || provablyFair.generateSecureHex(8);
        const serverSeed = this.currentRound.serverSeed;
        const commitment = this.currentRound.commitment;

        // Verify and calculate roll
        const result = await provablyFair.verifyAndRoll(serverSeed, clientSeed, commitment);

        if (!result.valid) {
            this.battleLog.textContent = '⚠️ ' + result.error;
            this.battleLog.style.color = '#ff073a';
            return;
        }

        const roll = result.roll;

        // Reveal Server Seed
        this.serverSeedInput.value = serverSeed;
        this.serverSeedInput.title = 'Verified ✓';

        // -----------------------------------

        this.showDiceFace(roll);

        await new Promise(r => setTimeout(r, 800)); // Let player see result

        // Logic
        const isLow = roll <= 3; // 1,2,3
        const isHigh = roll >= 4; // 4,5,6

        let playerWonTurn = false;
        if (prediction === 'low' && isLow) playerWonTurn = true;
        if (prediction === 'high' && isHigh) playerWonTurn = true;

        if (playerWonTurn) {
            // Player Attack
            const crit = (roll === 1 || roll === 6) ? 1.5 : 1;
            const dmg = Math.floor(this.baseDamage * crit);
            this.opponentHP = Math.max(0, this.opponentHP - dmg);

            this.battleLog.textContent = t('hitMsg', { dmg: dmg }) + ` [Roll: ${roll}] ✓`;
            this.battleLog.style.color = '#39ff14';

            // Shake effect on opponent
            this.game.opponentDisplay.style.transform = "translateX(10px)";
            setTimeout(() => this.game.opponentDisplay.style.transform = "none", 100);
        } else {
            // Opponent Attack
            const dmg = Math.floor(this.baseDamage * 0.8);
            this.playerHP = Math.max(0, this.playerHP - dmg);

            this.battleLog.textContent = t('missMsg', { dmg: dmg }) + ` [Roll: ${roll}] ✓`;
            this.battleLog.style.color = '#ff073a';

            // Shake effect on player
            this.game.playerDisplay.style.transform = "translateX(-10px)";
            setTimeout(() => this.game.playerDisplay.style.transform = "none", 100);
        }

        this.updateHPUI();

        // Check Win Condition
        if (this.playerHP <= 0 || this.opponentHP <= 0) {
            this.endFight();
        } else {
            // Next Turn
            this.btnLow.disabled = false;
            this.btnHigh.disabled = false;

            // New client seed for next round
            this.clientSeedInput.value = provablyFair.generateSecureHex(8);

            await this.prepareTurn();
        }
    }

    showDiceFace(num) {
        this.diceEl.className = `dice show-${num}`;
    }

    updateHPUI() {
        const pPct = (this.playerHP / this.playerMaxHP) * 100;
        const oPct = (this.opponentHP / this.opponentMaxHP) * 100;

        this.playerHPBar.style.width = `${pPct}%`;
        this.playerHPText.textContent = `${this.playerHP}/${this.playerMaxHP}`;

        this.opponentHPBar.style.width = `${oPct}%`;
        this.opponentHPText.textContent = `${this.opponentHP}/${this.opponentMaxHP}`;
    }

    endFight() {
        this.interactionArea.classList.add('hidden');
        this.vsOverlay.classList.remove('hidden');

        const isWin = this.playerHP > 0;
        this.game.endCombat(isWin, this.opponent);
    }
}
