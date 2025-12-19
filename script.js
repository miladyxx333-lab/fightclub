class CyberPolloGame {
    constructor() {
        // Auth check
        // Auth check happens in init now or redirected
        // auth.requireAuth(); // Moved to init async
        // this.user = auth.getCurrentUser(); // Will load in init

        this.allFighters = [];
        this.filteredFighters = [];
        this.selectedFighter = null;
        this.currentPage = 1;
        this.itemsPerPage = 4; // User requested only 4 images

        // Betting State
        this.betAmount = 100;
        this.riskMultiplier = 2;
        this.isFighting = false;

        // Start init safely
        setTimeout(() => this.init(), 100);
    }

    async init() {
        await auth.requireAuth();
        this.user = auth.getCurrentUser();

        await this.loadMetadata();
        this.cacheDOM();
        this.bindEvents();
        this.renderGrid();
        this.updateFinancials();
        this.updateUI(); // Initial balance show

        document.getElementById('logout-btn').addEventListener('click', () => auth.logout());
    }

    cacheDOM() {
        this.gridEl = document.getElementById('fighters-grid');
        this.searchInput = document.getElementById('search-input');

        // Cyber Controls
        this.btnRandom = document.getElementById('sort-random');
        this.btnAsc = document.getElementById('sort-asc');
        this.btnDesc = document.getElementById('sort-desc');

        this.prevBtn = document.getElementById('prev-page');
        this.nextBtn = document.getElementById('next-page');
        this.pageInfo = document.getElementById('page-info');

        this.playerDisplay = document.getElementById('player-fighter-display');
        this.opponentDisplay = document.getElementById('opponent-fighter-display');
        this.battleLog = document.getElementById('battle-log');

        // Betting DOM
        this.betInput = document.getElementById('bet-amount');
        this.riskSlider = document.getElementById('risk-slider');
        this.riskValue = document.getElementById('risk-value');
        this.winChanceEl = document.getElementById('win-chance');
        this.potentialWinEl = document.getElementById('potential-win');
        this.startBtn = document.getElementById('start-fight-btn');
        this.creditsEl = document.getElementById('user-credits');
    }

    loadMetadata() {
        if (window.chickenData) {
            this.allFighters = window.chickenData;
            // Initial Random Sort as requested
            this.filteredFighters = [...this.allFighters].sort(() => 0.5 - Math.random());
        } else {
            console.error("Chicken data not found in window object");
            document.getElementById('fighters-grid').innerHTML = `<p class="error">DATA ERROR</p>`;
        }
    }

    bindEvents() {
        // Search
        this.searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            if (term === '') {
                // If cleared, random shuffle again for fun
                this.filteredFighters = [...this.allFighters].sort(() => 0.5 - Math.random());
            } else {
                this.filteredFighters = this.allFighters.filter(f =>
                    f.name.toLowerCase().includes(term) || f.id.toString() === term
                );
            }
            this.currentPage = 1;
            this.renderGrid();
        });

        // Sorting
        this.btnRandom.addEventListener('click', () => {
            // Shuffle filtered, or if search is empty, shuffle all
            this.filteredFighters = [...this.allFighters].sort(() => 0.5 - Math.random());
            this.currentPage = 1;
            this.searchInput.value = '';
            this.renderGrid();
        });

        this.btnAsc.addEventListener('click', () => {
            this.filteredFighters.sort((a, b) => parseInt(a.id) - parseInt(b.id));
            this.currentPage = 1;
            this.renderGrid();
        });

        this.btnDesc.addEventListener('click', () => {
            this.filteredFighters.sort((a, b) => parseInt(b.id) - parseInt(a.id));
            this.currentPage = 1;
            this.renderGrid();
        });

        // Pagination
        this.prevBtn.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderGrid();
            }
        });
        this.nextBtn.addEventListener('click', () => {
            const maxPage = Math.ceil(this.filteredFighters.length / this.itemsPerPage);
            if (this.currentPage < maxPage) {
                this.currentPage++;
                this.renderGrid();
            }
        });

        // Betting
        this.betInput.addEventListener('input', (e) => {
            this.betAmount = parseInt(e.target.value) || 0;
            this.updateFinancials();
        });
        this.riskSlider.addEventListener('input', (e) => {
            this.riskMultiplier = parseInt(e.target.value);
            this.updateFinancials();
        });

        this.startBtn.addEventListener('click', () => this.startCombat());
    }

    renderGrid() {
        this.gridEl.innerHTML = '';
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        const pageItems = this.filteredFighters.slice(start, end);

        if (pageItems.length === 0) {
            this.gridEl.innerHTML = `<div style="grid-column: span 2; text-align:center; color: #fff;">No Fighters Found</div>`;
            return;
        }

        pageItems.forEach(fighter => {
            const el = document.createElement('div');
            el.className = `cyber-card ${this.selectedFighter?.id === fighter.id ? 'selected' : ''}`;
            el.innerHTML = `
                <div class="card-img-wrapper">
                    <img src="${fighter.image}" class="card-img" loading="lazy">
                </div>
                <div class="card-info">
                    <span class="card-id">ID #${fighter.id}</span>
                    <div class="card-names">${fighter.name}</div>
                    <div class="card-stats">
                        <span title="Strength">💪 ${fighter.stats.strength}</span>
                        <span title="Speed">⚡ ${fighter.stats.speed}</span>
                    </div>
                </div>
            `;
            el.addEventListener('click', () => this.selectFighter(fighter));
            this.gridEl.appendChild(el);
        });

        // Update Nav
        const maxPage = Math.ceil(this.filteredFighters.length / this.itemsPerPage);
        this.pageInfo.textContent = `${this.currentPage} / ${maxPage}`;
        this.prevBtn.disabled = this.currentPage === 1;
        this.nextBtn.disabled = this.currentPage === maxPage || maxPage === 0;
    }

    selectFighter(fighter) {
        if (this.isFighting) return;
        this.selectedFighter = fighter;
        this.renderGrid(); // Re-render to show selection outline
        this.updateFighterDisplay(this.playerDisplay, fighter);
        this.checkStartReady();
    }

    updateFighterDisplay(container, fighter) {
        const img = container.querySelector('.fighter-img');
        const name = container.querySelector('.fighter-name');
        const stats = container.querySelector('.fighter-stats');
        const placeholder = container.querySelector('.placeholder-msg');

        if (fighter) {
            img.src = fighter.image;
            img.classList.remove('hidden');
            name.textContent = fighter.name;
            stats.classList.remove('hidden');
            placeholder.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            stats.classList.add('hidden');
            placeholder.classList.remove('hidden');
        }
    }

    updateFinancials() {
        this.riskValue.textContent = `x${this.riskMultiplier}.0`;

        // Formula: Base 95% at 1x logic (impossible here), scales down with multiplier
        // If x2 -> ~47.5% win rate
        // If x100 -> ~0.95% win rate
        const winChance = (95 / this.riskMultiplier).toFixed(2);
        this.winChanceEl.textContent = `${winChance}%`;

        const potential = Math.floor(this.betAmount * this.riskMultiplier);
        this.potentialWinEl.textContent = `+${potential}`;
    }

    checkStartReady() {
        if (this.selectedFighter && this.betAmount > 0 && this.betAmount <= this.user.credits) {
            this.startBtn.disabled = false;
        } else {
            this.startBtn.disabled = true;
        }
    }

    async startCombat() {
        if (this.isFighting) return;

        // Refresh user state
        this.user = auth.getCurrentUser();

        if (this.betAmount > this.user.credits) {
            alert(t('noCreditsWrapper'));
            return;
        }

        this.isFighting = true;
        this.startBtn.disabled = true;

        // Deduct via Auth
        // Deduct via Auth (Async)
        const success = await auth.deductCredits(this.betAmount);
        if (!success) {
            alert(t('insufficient'));
            this.isFighting = false;
            this.startBtn.disabled = false;
            return;
        }
        this.updateUI();

        // Select Opponent
        const opponent = this.allFighters[Math.floor(Math.random() * this.allFighters.length)];
        this.updateFighterDisplay(this.opponentDisplay, opponent);

        // Start Interactive Combat Session
        new CombatSession(this.selectedFighter, opponent, this.riskMultiplier, this);
    }

    async endCombat(isWin, opponent) {
        this.isFighting = false;
        this.checkStartReady();

        if (isWin) {
            const winnings = Math.floor(this.betAmount * this.riskMultiplier);
            // Add via Auth
            // Add via Auth
            await auth.addCredits(winnings);

            this.battleLog.textContent = t('winMsg', { amount: winnings });
            this.battleLog.style.color = '#22c55e';
            // Play win animation
        } else {
            this.battleLog.textContent = t('lossMsg', { name: this.selectedFighter.name, opponent: opponent.name });
            this.battleLog.style.color = '#ef4444';
        }

        this.updateUI();
    }

    updateUI() {
        this.user = auth.getCurrentUser();
        this.creditsEl.textContent = this.user.credits;
    }
}

// Global Toggle
function toggleLanguage() {
    const newLang = currentLang === 'es' ? 'en' : 'es';
    setLanguage(newLang);
    // Ideally re-render grid or components if they have text, but grid is mostly names/images.
    // Page info might need update
    const game = window.chickenGame;
    if (game) game.renderGrid();
}

window.addEventListener('DOMContentLoaded', () => {
    // Init Lang
    const saved = localStorage.getItem('cyberpollo_lang') || 'es';
    setLanguage(saved);
    // Load Meta
    const game = new CyberPolloGame();
    window.chickenGame = game;

    // --- Modal Logic ---
    const modal = document.getElementById('withdraw-modal');
    const openBtn = document.getElementById('open-withdraw-btn');
    const cancelBtn = document.getElementById('cancel-withdraw');
    const confirmBtn = document.getElementById('confirm-withdraw');
    const walletInput = document.getElementById('wallet-address');
    const amountInput = document.getElementById('withdraw-amount');

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            modal.classList.remove('hidden');
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            // ... existing confirm logic ...
            const wallet = walletInput.value.trim();
            const amount = parseInt(amountInput.value);
            // ... 
            alert(t('successClaim'));
            modal.classList.add('hidden');
            game.updateUI();
        });
    }

    // FORCE INIT after a short delay to ensure DOM is ready and Auth checked
    setTimeout(() => {
        console.log("Force initializing game...");
        if (!window.chickenGame.initialized) {
            window.chickenGame.init();
        }
    }, 500);
});
