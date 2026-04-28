// ============================================
// ARENA LOBBY — List, Create & Join P2P Fights
// ============================================

const CONFIG = {
    // ⚠️ UPDATE THESE FOR MAINNET DEPLOYMENT
    AUTHORITY_PUBKEY: 'e6uU5apmNZrUX4L2fCZ7hupZMwofS3JUNXEHcSxqcBD', // The backend's house wallet public key
    TOKEN_MINTS: {
        'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Mainnet USDC
        'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'  // Mainnet BONK
    }
};

class ArenaLobby {
    constructor() {
        this.fights = [];
        this.selectedFighter = null;
        this.allFighters = [];
        this.fighterPage = 1;
        this.fighterPageSize = 4;
        this.realtimeChannel = null;
        this.modalMode = 'create'; // 'create' or 'join'

        this.init();
    }

    async init() {
        // Load fighter metadata
        if (window.chickenData) {
            this.allFighters = [...window.chickenData].sort(() => 0.5 - Math.random());
        }

        this.cacheDOM();
        this.bindEvents();
        this.renderFighterGrid();
        this.loadFights();
        this.subscribeToFights();
        this.startExpiryChecker();
    }

    cacheDOM() {
        // Wallet
        this.connectBtn = document.getElementById('connect-wallet-btn');
        this.walletInfo = document.getElementById('wallet-info');
        this.walletAddress = document.getElementById('wallet-address');

        // Lobby
        this.fightsContainer = document.getElementById('fights-list');
        this.fightCount = document.getElementById('fight-count');
        this.filterBtns = document.querySelectorAll('.filter-btn');

        // Create fight modal
        this.createModal = document.getElementById('create-fight-modal');
        this.fighterGrid = document.getElementById('arena-fighter-grid');
        this.tokenInput = document.getElementById('token-symbol-input');
        this.betAmountInput = document.getElementById('arena-bet-amount');
        this.selectedFighterDisplay = document.getElementById('selected-fighter-preview');
        this.createFightBtn = document.getElementById('confirm-create-fight');
        this.feeDisplay = document.getElementById('fee-display');
        this.payoutDisplay = document.getElementById('payout-display');

        // Fighter pagination
        this.prevFighterBtn = document.getElementById('arena-prev-fighter');
        this.nextFighterBtn = document.getElementById('arena-next-fighter');
        this.fighterPageInfo = document.getElementById('arena-fighter-page');
    }

    bindEvents() {
        // Wallet
        this.connectBtn?.addEventListener('click', () => this.connectWallet());

        // Create fight button (opens modal)
        document.getElementById('open-create-fight')?.addEventListener('click', () => {
            if (!wallet.connected) {
                alert('Connect your wallet first!');
                return;
            }
            this.modalMode = 'create';
            this.resetCreateModal();
            this.createModal.classList.remove('hidden');
        });

        // Close modal
        document.getElementById('close-create-modal')?.addEventListener('click', () => {
            this.createModal.classList.add('hidden');
        });

        // Confirm create/join fight
        this.createFightBtn?.addEventListener('click', () => this.handleConfirmClick());

        // Bet amount change
        this.betAmountInput?.addEventListener('input', () => this.updateFeePreview());

        // Fighter pagination
        this.prevFighterBtn?.addEventListener('click', () => {
            if (this.fighterPage > 1) {
                this.fighterPage--;
                this.renderFighterGrid();
            }
        });
        this.nextFighterBtn?.addEventListener('click', () => {
            const maxPage = Math.ceil(this.allFighters.length / this.fighterPageSize);
            if (this.fighterPage < maxPage) {
                this.fighterPage++;
                this.renderFighterGrid();
            }
        });

        // Shuffle fighters
        document.getElementById('arena-shuffle')?.addEventListener('click', () => {
            this.allFighters.sort(() => 0.5 - Math.random());
            this.fighterPage = 1;
            this.renderFighterGrid();
        });

        // Filter buttons
        this.filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderFights();
            });
        });

        // Wallet events
        wallet.on('connect', (addr) => {
            this.connectBtn.classList.add('hidden');
            this.walletInfo.classList.remove('hidden');
            this.walletAddress.textContent = wallet.getShortAddress();
        });

        wallet.on('disconnect', () => {
            this.connectBtn.classList.remove('hidden');
            this.walletInfo.classList.add('hidden');
        });
    }

    async connectWallet() {
        try {
            this.connectBtn.textContent = 'Connecting...';
            this.connectBtn.disabled = true;
            await wallet.connect();
        } catch (err) {
            alert(err.message);
        } finally {
            this.connectBtn.textContent = '🔌 Connect Wallet';
            this.connectBtn.disabled = false;
        }
    }

    // ── Fighter Grid ──────────────────────────
    renderFighterGrid() {
        if (!this.fighterGrid) return;
        this.fighterGrid.innerHTML = '';

        const start = (this.fighterPage - 1) * this.fighterPageSize;
        const pageItems = this.allFighters.slice(start, start + this.fighterPageSize);

        pageItems.forEach(fighter => {
            const el = document.createElement('div');
            el.className = `arena-fighter-card ${this.selectedFighter?.id === fighter.id ? 'selected' : ''}`;
            el.innerHTML = `
                <img src="${fighter.image}" alt="${fighter.name}" loading="lazy">
                <span class="af-name">${fighter.name}</span>
                <span class="af-id">#${fighter.id}</span>
            `;
            el.addEventListener('click', () => this.selectFighter(fighter));
            this.fighterGrid.appendChild(el);
        });

        const maxPage = Math.ceil(this.allFighters.length / this.fighterPageSize);
        if (this.fighterPageInfo) {
            this.fighterPageInfo.textContent = `${this.fighterPage} / ${maxPage}`;
        }
        if (this.prevFighterBtn) this.prevFighterBtn.disabled = this.fighterPage === 1;
        if (this.nextFighterBtn) this.nextFighterBtn.disabled = this.fighterPage >= maxPage;
    }

    selectFighter(fighter) {
        this.selectedFighter = fighter;
        this.renderFighterGrid();
        if (this.selectedFighterDisplay) {
            this.selectedFighterDisplay.innerHTML = `
                <img src="${fighter.image}" class="preview-img">
                <span>${fighter.name}</span>
            `;
        }
    }

    // ── Fee Preview ───────────────────────────
    updateFeePreview() {
        const amount = parseFloat(this.betAmountInput?.value) || 0;
        const fee = (amount * 2 * 0.03).toFixed(2);
        const payout = (amount * 2 - amount * 2 * 0.03).toFixed(2);
        if (this.feeDisplay) this.feeDisplay.textContent = fee;
        if (this.payoutDisplay) this.payoutDisplay.textContent = payout;
    }

    // ── Load & Render Fights ──────────────────
    async loadFights() {
        try {
            const { data, error } = await supabase
                .from('arena_fights')
                .select('*')
                .in('status', ['waiting', 'active'])
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            this.fights = data || [];
            this.renderFights();
        } catch (err) {
            console.error('Error loading fights:', err);
        }
    }

    renderFights() {
        if (!this.fightsContainer) return;

        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';

        let filtered = this.fights;
        if (activeFilter === 'waiting') {
            filtered = this.fights.filter(f => f.status === 'waiting');
        } else if (activeFilter === 'active') {
            filtered = this.fights.filter(f => f.status === 'active');
        }

        if (this.fightCount) {
            this.fightCount.textContent = filtered.length;
        }

        if (filtered.length === 0) {
            this.fightsContainer.innerHTML = `
                <div class="empty-lobby">
                    <span class="empty-icon">⚔️</span>
                    <p>No fights yet. Be the first to create one!</p>
                </div>
            `;
            return;
        }

        this.fightsContainer.innerHTML = filtered.map(fight => this.renderFightCard(fight)).join('');

        // Bind join buttons
        this.fightsContainer.querySelectorAll('.join-fight-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const fightId = e.target.dataset.fightId;
                this.openJoinModal(fightId);
            });
        });
    }

    renderFightCard(fight) {
        const timeAgo = this.timeAgo(fight.created_at);
        const isOwnFight = wallet.publicKey === fight.creator_wallet;
        const isActive = fight.status === 'active';
        const shortWallet = fight.creator_wallet.slice(0, 4) + '...' + fight.creator_wallet.slice(-4);

        const expiresIn = fight.expires_at ? this.timeRemaining(fight.expires_at) : '';

        return `
            <div class="fight-card ${isActive ? 'fight-active' : ''} ${isOwnFight ? 'fight-own' : ''}">
                <div class="fight-card-top">
                    <div class="fight-token-badge">
                        <span class="token-symbol">${fight.token_symbol}</span>
                    </div>
                    <div class="fight-amount">
                        <span class="amount-value">${fight.bet_amount_display || fight.bet_amount}</span>
                    </div>
                    <div class="fight-status-badge status-${fight.status}">
                        ${fight.status === 'waiting' ? '⏳ Waiting' : '⚔️ Fighting'}
                    </div>
                </div>

                <div class="fight-card-body">
                    <div class="fight-creator">
                        <img src="${fight.creator_fighter_image || ''}" class="fight-fighter-img" alt="">
                        <div class="fight-creator-info">
                            <span class="fight-fighter-name">${fight.creator_fighter_name || 'CyberPollo'}</span>
                            <span class="fight-wallet">${shortWallet}</span>
                        </div>
                    </div>

                    <div class="fight-vs">VS</div>

                    <div class="fight-challenger">
                        ${fight.challenger_wallet ? `
                            <img src="${fight.challenger_fighter_image || ''}" class="fight-fighter-img" alt="">
                            <span class="fight-fighter-name">${fight.challenger_fighter_name || '???'}</span>
                        ` : `
                            <div class="challenger-placeholder">
                                <span>?</span>
                            </div>
                        `}
                    </div>
                </div>

                <div class="fight-card-footer">
                    <span class="fight-time">${timeAgo}${expiresIn ? ` · ${expiresIn}` : ''}</span>
                    ${fight.status === 'waiting' && !isOwnFight ? `
                        <button class="join-fight-btn" data-fight-id="${fight.id}">
                            ⚔️ JOIN FIGHT
                        </button>
                    ` : ''}
                    ${fight.status === 'waiting' && isOwnFight ? `
                        <button class="cancel-fight-btn" data-fight-id="${fight.id}">
                            Cancel
                        </button>
                    ` : ''}
                    ${fight.status === 'active' ? `
                        <button class="watch-fight-btn" data-fight-id="${fight.id}">
                            👁️ Watch
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // ── Create Fight (On-Chain Escrow) ──────────
    async createFight() {
        if (!wallet.connected) {
            alert('Connect your wallet first!');
            return;
        }
        if (!this.selectedFighter) {
            alert('Select a fighter first!');
            return;
        }
        const tokenSymbol = this.tokenInput?.value.trim().toUpperCase() || 'SOL';
        const isCreditFight = tokenSymbol === 'CREDITS' || tokenSymbol === 'CRD';

        if (!isCreditFight && (!escrow || !escrow.ensureInitialized())) {
            alert('Escrow client not initialized. Reload the page.');
            return;
        }

        const betAmount = parseFloat(this.betAmountInput?.value) || 0;
        const decimals = isCreditFight ? 0 : (tokenSymbol === 'USDC' ? 6 : (tokenSymbol === 'BONK' ? 5 : 9));

        if (betAmount <= 0) {
            alert('Enter a valid bet amount!');
            return;
        }

        this.createFightBtn.disabled = true;
        this.createFightBtn.textContent = 'Building Escrow TX...';

        try {
            const rawAmount = Math.floor(betAmount * Math.pow(10, decimals));

            // Generate a unique fight ID (UUID-like) for the PDA seed
            const fightId = crypto.randomUUID();

            // Authority = the backend's resolution wallet (house wallet for now)
            const AUTHORITY_PUBKEY = CONFIG.AUTHORITY_PUBKEY;

            let txSignature = 'credits_internal_tx';

            if (!isCreditFight) {
                let tx;
                if (tokenSymbol === 'SOL') {
                    // 1. Build the Anchor create_fight transaction for Native SOL
                    tx = await escrow.buildCreateFightTx(
                        fightId,
                        rawAmount,
                        wallet.publicKey,
                        AUTHORITY_PUBKEY
                    );
                } else {
                    // 1. Build SPL Token transaction
                    const mintAddress = CONFIG.TOKEN_MINTS[tokenSymbol];
                    tx = await escrow.buildCreateFightSplTx(
                        fightId,
                        rawAmount,
                        wallet.publicKey,
                        AUTHORITY_PUBKEY,
                        mintAddress
                    );
                }

                this.createFightBtn.textContent = 'Awaiting Wallet Approval...';

                // 2. Sign and send via wallet
                txSignature = await wallet.signAndSendTransaction(tx);
                this.createFightBtn.textContent = 'Confirming on-chain...';
            }

            // 3. Register fight in Supabase (backend)
            const response = await fetch('/api/arena/create-fight', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    txSignature: txSignature,
                    fightId: fightId, 
                    creatorWallet: wallet.publicKey,
                    username: wallet.getShortAddress(),
                    fighterId: this.selectedFighter.id.toString(),
                    fighterName: this.selectedFighter.name,
                    fighterImage: this.selectedFighter.image,
                    tokenMint: isCreditFight ? 'credits' : (tokenSymbol === 'SOL' ? 'native' : CONFIG.TOKEN_MINTS[tokenSymbol]),
                    tokenSymbol: tokenSymbol,
                    betAmount: isCreditFight ? betAmount : rawAmount,
                    betDisplay: `${betAmount} ${tokenSymbol}`,
                    escrowPDA: isCreditFight ? null : escrow.getFightPDA(fightId).pda.toBase58(),
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            this.createModal.classList.add('hidden');
            this.selectedFighter = null;

            // Show success
            const msg = isCreditFight ? '⚔️ Joined fight with credits!' : `⚔️ Fight joined on-chain! PDA: ${escrow.getFightPDA(fightId).pda.toBase58().slice(0,8)}...`;
            this.showToast(msg, 'success');

        } catch (err) {
            console.error('Error creating fight:', err);
            if (!err.message.includes('User rejected')) {
                alert('Error processing fight: ' + err.message);
            }
        } finally {
            this.createFightBtn.disabled = false;
            this.createFightBtn.textContent = '⚔️ CREATE FIGHT';
        }
    }

    // ── Join Fight ────────────────────────────
    openJoinModal(fightId) {
        if (!wallet.connected) {
            alert('Connect your wallet first!');
            return;
        }

        const fight = this.fights.find(f => f.id === fightId);
        if (!fight) return;

        // Open fighter select for joining
        this.joiningFightId = fightId;
        this.joiningFight = fight;

        // Reuse create modal but change context
        this.modalMode = 'join';
        document.getElementById('create-modal-title').textContent = '⚔️ JOIN FIGHT';
        document.getElementById('token-select-section').classList.add('hidden');
        document.getElementById('bet-section').classList.add('hidden');
        document.getElementById('join-info').classList.remove('hidden');
        document.getElementById('join-info').innerHTML = `
            <div class="join-match-info">
                <span>Betting: <strong>${fight.bet_amount_display}</strong></span>
                <span>vs: <strong>${fight.creator_fighter_name}</strong></span>
                <span>Fee: <strong>3%</strong></span>
            </div>
        `;

        this.createFightBtn.textContent = '⚔️ JOIN & FIGHT';
        this.createModal.classList.remove('hidden');
    }

    handleConfirmClick() {
        if (this.modalMode === 'join') {
            this.joinFight();
        } else {
            this.createFight();
        }
    }

    async joinFight() {
        if (!this.selectedFighter || !this.joiningFightId) return;
        
        const fight = this.joiningFight;
        const isCreditFight = fight.token_mint === 'credits';

        if (!isCreditFight && (!escrow || !escrow.ensureInitialized())) {
            alert('Escrow client not initialized. Reload the page.');
            return;
        }

        this.createFightBtn.disabled = true;
        this.createFightBtn.textContent = 'Building Escrow TX...';

        try {
            // The joiningFightId is the Supabase UUID, which is also the PDA seed
            const fightId = this.joiningFightId;

            let txSignature = 'credits_internal_tx';

            if (!isCreditFight) {
                let tx;
                if (fight.token_symbol === 'SOL' || fight.token_mint === 'native') {
                    // 1. Build the Anchor join_fight transaction
                    tx = await escrow.buildJoinFightTx(fightId, wallet.publicKey);
                } else {
                    tx = await escrow.buildJoinFightSplTx(fightId, wallet.publicKey, fight.token_mint);
                }

                this.createFightBtn.textContent = 'Awaiting Wallet Approval...';

                // 2. Sign and send via wallet
                txSignature = await wallet.signAndSendTransaction(tx);
                this.createFightBtn.textContent = 'Confirming on-chain...';
            }

            // 3. Contact Backend API to update fight status
            const response = await fetch('/api/arena/join-fight', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fightId: fightId,
                    txSignature: txSignature,
                    challengerWallet: wallet.publicKey,
                    username: wallet.getShortAddress(),
                    fighterId: this.selectedFighter.id.toString(),
                    fighterName: this.selectedFighter.name,
                    fighterImage: this.selectedFighter.image
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            this.createModal.classList.add('hidden');

            // Navigate to combat
            window.location.href = `arena_fight.html?id=${fightId}&role=challenger`;

        } catch (err) {
            console.error('Error joining fight:', err);
            if (!err.message.includes('User rejected')) {
                alert('Error joining fight: ' + err.message);
            }
        } finally {
            this.createFightBtn.disabled = false;
            this.resetCreateModal();
        }
    }

    resetCreateModal() {
        document.getElementById('create-modal-title').textContent = '⚔️ CREATE A FIGHT';
        // document.getElementById('token-select-section')?.classList.remove('hidden'); // MVP strictly uses SOL
        document.getElementById('bet-section')?.classList.remove('hidden');
        document.getElementById('join-info')?.classList.add('hidden');
        this.createFightBtn.textContent = '⚔️ CREATE FIGHT';
        this.modalMode = 'create';
        this.joiningFightId = null;
        this.joiningFight = null;
    }

    // ── Realtime Subscription ─────────────────
    subscribeToFights() {
        this.realtimeChannel = supabase
            .channel('arena-lobby')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'arena_fights' },
                (payload) => {
                    this.handleRealtimeUpdate(payload);
                }
            )
            .subscribe();
    }

    handleRealtimeUpdate(payload) {
        const { eventType, new: newRow, old: oldRow } = payload;

        if (eventType === 'INSERT') {
            this.fights.unshift(newRow);
            this.showToast(`⚔️ New fight: ${newRow.bet_amount_display}`, 'info');
        } else if (eventType === 'UPDATE') {
            const idx = this.fights.findIndex(f => f.id === newRow.id);
            if (idx !== -1) {
                this.fights[idx] = newRow;
            }

            // If a fight we created was joined, navigate to combat
            if (newRow.status === 'active' && oldRow?.status === 'waiting') {
                if (newRow.creator_wallet === wallet.publicKey) {
                    // Our fight was accepted!
                    this.showToast('🔥 A challenger appeared! Fight starting...', 'success');
                    setTimeout(() => {
                        window.location.href = `arena_fight.html?id=${newRow.id}&role=creator`;
                    }, 1500);
                }
            }
        } else if (eventType === 'DELETE') {
            this.fights = this.fights.filter(f => f.id !== oldRow.id);
        }

        this.renderFights();
    }

    // ── Expiry Checker ────────────────────────
    startExpiryChecker() {
        setInterval(() => {
            const now = new Date();
            this.fights = this.fights.filter(f => {
                if (f.status === 'waiting' && f.expires_at && new Date(f.expires_at) < now) {
                    return false; // Remove expired
                }
                return true;
            });
            this.renderFights();
        }, 30000); // Check every 30s
    }

    // ── Utilities ─────────────────────────────
    timeAgo(dateStr) {
        const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    timeRemaining(dateStr) {
        const remaining = new Date(dateStr) - Date.now();
        if (remaining <= 0) return 'expired';
        const mins = Math.floor(remaining / 60000);
        return `⏰ ${mins}m left`;
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `arena-toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    window.arenaLobby = new ArenaLobby();
});
