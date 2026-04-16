# FightClub × Solana.new — Build Context
## Phase Handoff: Phase 1 ✅ | Phase 2 ✅ | Phase 3 ✅ | Phase 4 ✅ | Phase 5 ✅ → Phase 6 🔜

> **Last updated**: 2026-04-15
> **Project path**: `/Users/urielhernandez/.gemini/antigravity/scratch/fightclub`
> **GitHub**: https://github.com/miladyxx333-lab/fightclub
> **Integration plan**: See `artifacts/integration_plan.md` in conversation `73ff93ac-e990-453d-97c7-6ef23d621879`

---

## What This Project Is

**CyberPollo Arena** (FightClub) — A web-based PvP betting game on Solana where players:
1. Select a KillPollo NFT fighter (from a 10,000 NFT collection)
2. Place bets in SOL (or SPL tokens in the future)
3. Fight via a dice-based combat engine (predict High/Low)
4. Winner takes the pot minus 3% house fee

The project is being integrated with **solana.new** (https://github.com/sendaifun/solana-new) — a skills + knowledge base for building on Solana with AI agents.

---

## Current Architecture

```
Frontend: Vanilla HTML/CSS/JS (Cyberpunk theme, multi-language ES/EN)
Backend:  Vercel Serverless Functions (Node.js)
Database: Supabase (Postgres + Realtime)
Payments: Solana Pay (QR codes) + direct SOL transfers
Deploy:   Vercel (vercel.json configured)
Wallets:  Phantom / Solflare / Backpack via wallet_adapter.js
```

### Key Files Map

| Category | Files | Purpose |
|----------|-------|---------|
| **Auth** | `auth_supabase.js` (v3), `wallet_adapter.js` | Wallet-native signMessage auth (JUST MIGRATED in Phase 1) |
| **Auth (legacy)** | `auth.js` | Deprecated shim — kept for backward compat |
| **Combat** | `combat_engine.js`, `script.js` | Solo game: dice rolls, HP, bet multiplier |
| **Arena P2P** | `arena.js`, `arena_combat.js`, `arena_fight.html` | P2P lobby with Supabase Realtime |
| **API - Payments** | `api/create-payment.js`, `api/check-payment.js` | Solana Pay QR generation + polling |
| **API - Arena** | `api/arena/create-fight.js`, `api/arena/join-fight.js`, `api/arena/resolve-fight.js` | Escrow flow (CURRENTLY CUSTODIAL — needs Phase 2) |
| **DB Schemas** | `arena_setup.sql`, `supabase_custom_users.sql`, `supabase_wallet_auth_migration.sql` | All SQL migrations |
| **Supabase** | `supabaseClient.js` | Client init (anon key hardcoded — security issue) |
| **Pages** | `index.html`, `login.html`, `game.html`, `arena.html`, `store.html`, `nft.html`, `profile.html`, `leaderboard.html`, `admin.html` | All 9 app pages + landing |
| **Config** | `.env.local`, `vercel.json`, `package.json` | Environment and deploy config |

### Supabase Tables

1. **`game_users`** — Players (id, username, wallet_address, credits, auth_nonce, password[deprecated])
2. **`payment_orders`** — Solana Pay orders (id, wallet, amount_usd, amount_sol, status, memo)
3. **`arena_fights`** — P2P fights (creator/challenger info, bet amounts, status, combat_state, escrow tracking)
4. **`arena_history`** — Fight results log

### Environment Variables (`.env.local`)
```
SOLANA_RPC="https://api.mainnet-beta.solana.com"
SUPABASE_KEY="eyJ..." (anon key)
SUPABASE_URL="https://hpebvddocrfqtkbvqusk.supabase.co"
VERCEL_OIDC_TOKEN="eyJ..." (Vercel deploy token)
```

**Missing but needed for Phase 2:**
```
MERCHANT_WALLET=e6uU5apmNZrUX4L2fCZ7hupZMwofS3JUNXEHcSxqcBD
MERCHANT_PRIVATE_KEY=<base58 encoded — NEVER commit>
PROGRAM_ID=<to be generated when Anchor program deploys>
```

---

## Phase 1 Completion Summary (Auth Migration)

### What Was Done
- ✅ Replaced username/password auth with Solana wallet `signMessage` flow
- ✅ Created SQL migration (`supabase_wallet_auth_migration.sql`) adding `wallet_address` column and 3 new RPCs
- ✅ Rewrote `auth_supabase.js` (v3) with `loginWithWallet()` method
- ✅ Rewrote `login.html` with Phantom/Solflare/Other wallet buttons
- ✅ Updated all 10 HTML pages to load `wallet_adapter.js`
- ✅ Updated leaderboard, profile, admin to use wallet-based identity
- ✅ Deprecated old `auth.js` to a harmless shim

### What Still Needs To Happen
- ⚠️ **SQL migration** (`supabase_wallet_auth_migration.sql`) needs to be RUN in Supabase Dashboard
- ⚠️ **Anchor program** needs to be deployed to devnet (see Phase 2 summary)
- ⚠️ **Program ID** needs to be updated in `escrow_client.js`, `Anchor.toml`, `lib.rs`, `.env.local`

---

## Phase 2 Completion Summary (On-Chain Escrow)

### What Was Done
- ✅ Anchor program `fight_escrow` with 5 instructions (create, join, resolve, cancel, close)
- ✅ PDA-based escrow: `seeds = [b"fight_escrow", fight_id.as_bytes()]`
- ✅ Browser-side `escrow_client.js` — builds raw TXs without Anchor SDK
- ✅ `arena.js` createFight/joinFight now use escrow PDA instead of house wallet
- ✅ All 3 backend APIs rewritten: verify on-chain state, confirm TXs
- ✅ New `cancel-fight.js` API endpoint
- ✅ Fee collection via `fee_collector` account (3% = 300 bps)

### Phase 3 Completion: Provably Fair Randomness

#### What Was Done
- ✅ Created `provably_fair.js` — SHA-256 commit-reveal engine (crypto.getRandomValues)
- ✅ Created `api/arena/commit-round.js` — Backend generates seed, returns hash commitment
- ✅ Created `api/arena/reveal-round.js` — Backend reveals seed after player acts, client verifies
- ✅ Rewrote `arena_combat.js` — P2P combat now uses commit-reveal per turn
- ✅ Rewrote `combat_engine.js` — Solo combat also uses provably fair engine
- ✅ Zero `Math.random()` in any combat code
- ✅ Both sides verify each other's turns (cross-verification)
- ✅ Live verification panel shows round history with hashes
- ✅ Commit stored in Supabase `combat_state` JSONB (anti-replay)

#### How It Works
```
1. Backend: serverSeed = crypto.randomBytes(32)
2. Backend: commitment = SHA-256(serverSeed)
3. Client sees commitment BEFORE predicting
4. Client submits: prediction + clientSeed
5. Backend reveals serverSeed
6. Both verify: SHA-256(serverSeed) === commitment ✓
7. Roll = SHA-256(serverSeed:clientSeed)[0:8] mod 6 + 1
```

### Phase 4 Completion: SPL Token Support

#### What Was Done
- ✅ Updated Anchor Program (`lib.rs`) to include `create_fight_spl`, `join_fight_spl`, `resolve_fight_spl`, and `cancel_fight_spl` using `anchor_spl::token`.
- ✅ Enabled holding SPL tokens securely within a PDA token account derived from `fight_escrow_token`.
- ✅ Kept full backward compatibility for Native SOL bets (`lib.rs` endpoints without `_spl`).
- ✅ Manually generated Associated Token Accounts (ATA) derivation logic in `escrow_client.js` with pure vanilla `@solana/web3.js`.
- ✅ Refactored generic `build___Tx` functions into `build___SplTx` counterparts that wire up `TOKEN_PROGRAM_ID` and mints.
- ✅ Exposed UI drop-down in `arena.html` to allow choosing `SOL`, `USDC`, and `BONK`.
- ✅ Handled scaling amounts by `decimals` logic directly in `arena.js` handling (USDC=6, BONK=5, SOL=9).
- ✅ Re-wrote Backend payouts in `resolve-fight.js` manually building the SPL equivalent Anchor instruction for automated house-signed payouts to the winner's ATA.
- ✅ Updated `api/arena/join-fight.js` and `api/arena/create-fight.js` to intelligently fetch `getTokenAccountBalance` over `getBalance` mapped conditionally by `tokenMint`.

### Phase 5 Completion: Security Hardening & Edge Cases

#### What Was Done
- ✅ Implemented dynamic Origin checking for CORS (`ALLOWED_ORIGIN` env var mappings) to restrict API boundary usage outside permitted sites.
- ✅ Developed an in-memory DDoS and Rate Limiting layer per Vercel Edge instance across all 6 API endpoints (e.g. 15 requests/min for resolutions, 10 limits for match formations).
- ✅ Added `maxRetries: 3` configuration for the `sendAndConfirmTransaction` to combat network congestion specifically on payouts.
- ✅ Guarded the `resolve-fight.js` Supabase updates: if the `MERCHANT_PRIVATE_KEY` fails to submit a transaction natively due to network or fund failure, it now cleanly throws a `500` without modifying `status: 'completed'`. This explicitly provisions users with natural "Retry Payout" idempotency.

### Phase 6 Target: Production Deploy & Docs
Phase 6 should prepare for Mainnet release:
- Ensure all Mainnet API keys, RPC endpoints, and Token Mints match reality instead of Devnet mocks.
- Test `anchor deploy` directly onto cluster.
- Replace `console.log` diagnostics with professional telemetry.

---

## Phase 2 Instructions: On-Chain Escrow with Anchor

### Objective
Replace the current **custodial house wallet** escrow pattern with a **non-custodial PDA-based escrow** using an Anchor program on Solana.

### Why This Is Critical
Currently in `api/arena/resolve-fight.js` (line 13), the house wallet private key is used server-side to send payouts via `SystemProgram.transfer`. This means:
- The house holds ALL bet funds (custodial risk)
- Private key must be stored as env var (single point of failure)
- No on-chain proof of fair escrow

### Current Escrow Flow (REPLACE THIS)
```
1. Creator calls wallet.sendBetTransaction() → SOL goes to house wallet
2. Challenger calls wallet.sendBetTransaction() → SOL goes to house wallet  
3. Combat happens (client-side dice rolls)
4. Backend calls resolve-fight API → house wallet sends SOL to winner
```

### Target Escrow Flow (BUILD THIS)
```
1. Creator calls Anchor ix `create_fight` → SOL goes to PDA escrow account
2. Challenger calls Anchor ix `join_fight` → SOL goes to same PDA escrow
3. Combat happens (ideally with on-chain commit-reveal, but can start with backend authority)
4. Backend authority calls Anchor ix `resolve_fight` → PDA releases SOL to winner
5. Optional: Creator can call `cancel_fight` if no challenger joins within timeout
```

### Implementation Plan

#### Step 1: Scaffold Anchor Program
```bash
# Install Anchor CLI if not present
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest
avm use latest

# Initialize program inside fightclub project
cd /Users/urielhernandez/.gemini/antigravity/scratch/fightclub
anchor init fight_escrow --no-git
```

This creates:
```
fight_escrow/
├── programs/fight_escrow/src/lib.rs   ← Main program
├── tests/fight_escrow.ts              ← Anchor tests
├── Anchor.toml                        ← Config
└── migrations/deploy.ts
```

#### Step 2: Program Design

**Accounts:**

```rust
#[account]
pub struct FightEscrow {
    pub fight_id: String,           // UUID from Supabase
    pub creator: Pubkey,            // Creator wallet
    pub challenger: Pubkey,         // Challenger wallet (Pubkey::default() initially)
    pub bet_amount: u64,            // Lamports per player
    pub total_pot: u64,             // bet_amount * 2
    pub status: FightStatus,        // Waiting, Active, Completed, Cancelled
    pub authority: Pubkey,          // Backend signer authorized to resolve
    pub created_at: i64,            // Clock timestamp
    pub expires_at: i64,            // Auto-cancel deadline
    pub bump: u8,                   // PDA bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum FightStatus {
    Waiting,
    Active,
    Completed,
    Cancelled,
}
```

**PDA Seeds:**
```rust
seeds = [b"fight_escrow", fight_id.as_bytes()]
bump
```

**Instructions:**

1. **`create_fight(fight_id: String, bet_amount: u64)`**
   - Creator deposits `bet_amount` lamports into PDA
   - Sets status = Waiting, stores creator pubkey
   - Validates: bet_amount > 0, fight_id unique

2. **`join_fight()`**
   - Challenger deposits matching `bet_amount` into PDA
   - Sets status = Active, stores challenger pubkey
   - Validates: status == Waiting, challenger != creator

3. **`resolve_fight(winner_role: u8)`**  ← winner_role: 0=creator, 1=challenger
   - Only callable by `authority` (backend signer)
   - Calculates fee (3%), transfers `total_pot - fee` to winner
   - Fee stays in PDA or goes to house wallet
   - Sets status = Completed
   - Validates: status == Active

4. **`cancel_fight()`**
   - Only callable by creator OR if current_time > expires_at
   - Refunds `bet_amount` to creator
   - Sets status = Cancelled
   - Validates: status == Waiting

5. **`close_escrow()`**
   - Reclaims rent from completed/cancelled fight accounts
   - Only authority can call

#### Step 3: Frontend Integration

**Files to modify:**

1. **`wallet_adapter.js`** — Add method:
```javascript
async sendAnchorTransaction(transaction) {
    if (!this.provider || !this.connected) throw new Error('Wallet not connected');
    const { signature } = await this.provider.signAndSendTransaction(transaction);
    return signature;
}
```

2. **New file: `escrow_client.js`** — Anchor client wrapper:
```javascript
class EscrowClient {
    constructor(programId, connection) {
        this.programId = new PublicKey(programId);
        this.connection = connection;
    }
    
    getFightPDA(fightId) {
        return PublicKey.findProgramAddressSync(
            [Buffer.from("fight_escrow"), Buffer.from(fightId)],
            this.programId
        );
    }
    
    async buildCreateFightTx(fightId, betAmount, creatorPubkey) { ... }
    async buildJoinFightTx(fightId, challengerPubkey) { ... }
}
```

3. **`arena.js` → `createFight()`** (line 310-375):
   - Replace `wallet.sendBetTransaction(lamports)` with Anchor `create_fight` instruction
   - Remove direct SOL transfer to house

4. **`arena.js` → `joinFight()`** (line 409-459):
   - Replace `wallet.sendBetTransaction(actualLamports)` with Anchor `join_fight` instruction

5. **`api/arena/resolve-fight.js`**:
   - Replace `SystemProgram.transfer` with Anchor `resolve_fight` instruction
   - Backend uses its authority keypair to sign

6. **`api/arena/create-fight.js`**:
   - Add on-chain verification: check that the tx actually called the Anchor program
   - Verify PDA exists and has correct state

#### Step 4: Testing Strategy
```
1. Deploy program to Devnet first
2. Fund test wallets with devnet SOL (solana airdrop 2)
3. Test full flow: create → join → resolve
4. Test edge cases: cancel, expire, double-join attempts
5. Verify PDA balances match expected state
```

### Important Context for the Agent

- **Supabase anon key** is hardcoded in multiple files — don't add more hardcoded secrets
- **House wallet**: `e6uU5apmNZrUX4L2fCZ7hupZMwofS3JUNXEHcSxqcBD` (used in `wallet_adapter.js:119` and `api/create-payment.js:84`)
- **The combat engine** (`combat_engine.js`) runs entirely client-side with pseudo-random dice. Phase 3 will address this with VRF/commit-reveal, but Phase 2 should NOT change the combat logic — just the money flow.
- **Supabase Realtime** is used for the arena lobby (`arena.js:473-482`). The fight status in Supabase should mirror on-chain state.
- **The `arena_fights` table** already has `creator_deposit_tx`, `challenger_deposit_tx`, and `payout_tx` columns for tracking on-chain transactions.
- **solana.new skills** to use: `build-with-claude`, `debug-program`, `virtual-solana-incubator`. Install with: `curl -fsSL https://www.solana.new/setup.sh | bash`

### Files NOT to Touch in Phase 2
- `login.html` — Just migrated, working
- `auth_supabase.js` — Just rewritten, stable
- `combat_engine.js` — Save for Phase 3 (VRF)
- `style.css`, `arena.css`, `store_marble.css` — No visual changes needed
- `lang.js` — Internationalization, unrelated

### Estimated Complexity
- **Anchor program**: ~200 lines of Rust
- **Frontend escrow_client.js**: ~150 lines of JS
- **API modifications**: ~100 lines changed across 3 files
- **Testing**: 1-2 days on devnet before mainnet
