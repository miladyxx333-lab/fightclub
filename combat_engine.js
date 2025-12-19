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

        this.init();
    }

    init() {
        this.vsOverlay.classList.add('hidden');
        this.interactionArea.classList.remove('hidden');
        this.battleLog.textContent = t('turnStart');
        this.updateHPUI();

        // Default random client seed if empty
        if (!this.clientSeedInput.value) {
            this.clientSeedInput.value = this.generateRandomHex(8);
        }

        this.prepareTurn();

        // Bind Controls
        this.boundLow = () => this.handleTurn('low');
        this.boundHigh = () => this.handleTurn('high');

        // Clear previous listeners and ENABLE buttons
        this.btnLow.onclick = this.boundLow;
        this.btnHigh.onclick = this.boundHigh;
        this.btnLow.disabled = false;
        this.btnHigh.disabled = false;

        // Reset dice visual
        this.diceEl.className = 'dice';
    }

    generateRandomHex(length) {
        let result = '';
        const characters = '0123456789abcdef';
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    prepareTurn() {
        // Generate new Server Seed for this round
        this.currentServerSeed = this.generateRandomHex(32);
        // Show hidden placeholder
        this.serverSeedInput.value = t('hiddenHash');
    }

    async handleTurn(prediction) {
        // Disable buttons
        this.btnLow.disabled = true;
        this.btnHigh.disabled = true;

        // Roll Dice Animation
        this.diceEl.className = 'dice rolling';

        // Wait for visual roll
        await new Promise(r => setTimeout(r, 600));

        // --- Deterministic Outcome Logic ---
        const clientSeed = this.clientSeedInput.value || "default_luck";
        const combined = this.currentServerSeed + clientSeed;

        let hashVal = 0;
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i);
            hashVal = ((hashVal << 5) - hashVal) + char;
            hashVal = hashVal & hashVal;
        }
        const positiveHash = Math.abs(hashVal);
        const roll = (positiveHash % 6) + 1;

        // Reveal Server Seed
        this.serverSeedInput.value = this.currentServerSeed;

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

            this.battleLog.textContent = t('hitMsg', { dmg: dmg });
            this.battleLog.style.color = '#39ff14';

            // Shake effect on opponent
            this.game.opponentDisplay.style.transform = "translateX(10px)";
            setTimeout(() => this.game.opponentDisplay.style.transform = "none", 100);
        } else {
            // Opponent Attack
            const dmg = Math.floor(this.baseDamage * 0.8); // Slightly less dmg from enemy usually
            this.playerHP = Math.max(0, this.playerHP - dmg);

            this.battleLog.textContent = t('missMsg', { dmg: dmg });
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
            this.prepareTurn();
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

// Modify CyberPolloGame to use CombatSession
// We will monkey-patch or just redefine the startCombat method in main script via this replacement tool if possible.
// Wait, I am overwriting a new file, but I need to integrate with main script. 
// I will output this class as a standalone file and include it, OR just append it to script.js. 
// Appending to script.js is safer to keep logic together.
