// ============================================
// ESCROW CLIENT — Browser-side Anchor program interface
// Builds transactions for the fight_escrow on-chain program.
// Uses raw @solana/web3.js (loaded from CDN in arena.html) —
// no Anchor JS SDK needed on the frontend.
// ============================================

class EscrowClient {
    // Program ID — UPDATE after `anchor deploy`
    static get PROGRAM_ID() {
        return window.ENV?.PROGRAM_ID || 'FiGHt1111111111111111111111111111111111111';
    }

    // Discriminators (first 8 bytes of sha256("global:<instruction_name>"))
    // Pre-computed for each instruction to avoid needing the Anchor SDK in browser.
    static IX_DISCRIMINATORS = {
        create_fight:  [164, 35, 186, 110, 78, 35, 242, 1],
        join_fight:    [225, 241, 119, 173, 247, 183, 30, 204],
        resolve_fight: [178, 193, 42, 198, 154, 218, 49, 22],
        cancel_fight:  [234, 118, 101, 37, 168, 236, 175, 71],
        close_escrow:  [125, 220, 210, 81, 201, 26, 237, 110],
        create_fight_spl:  [83, 237, 93, 9, 40, 132, 154, 84],
        join_fight_spl:    [21, 18, 184, 180, 234, 46, 245, 213],
        resolve_fight_spl: [18, 34, 113, 250, 237, 112, 111, 194],
        cancel_fight_spl:  [187, 146, 173, 74, 25, 146, 122, 42],
    };

    static TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    static ATOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

    constructor() {
        if (typeof solanaWeb3 === 'undefined') {
            throw new Error('Solana Web3 SDK not loaded. Include the CDN script first.');
        }

        const { PublicKey, Connection } = solanaWeb3;
        this.programId = new PublicKey(EscrowClient.PROGRAM_ID);
        this.connection = new Connection(
            window.SOLANA_RPC || 'https://api.devnet.solana.com',
            'confirmed'
        );
    }

    // ── PDA Derivation ────────────────────────

    /**
     * Derive the escrow PDA for a given fight ID.
     * Seeds: [b"fight_escrow", fight_id.as_bytes()]
     */
    getFightPDA(fightId) {
        const { PublicKey } = solanaWeb3;
        const [pda, bump] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('fight_escrow'),
                Buffer.from(fightId),
            ],
            this.programId
        );
        return { pda, bump };
    }

    /**
     * Derive the escrow Token Account PDA for SPL tokens
     */
    getFightTokenPDA(fightId) {
        const { PublicKey } = solanaWeb3;
        const [pda, bump] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('fight_escrow_token'),
                Buffer.from(fightId),
            ],
            this.programId
        );
        return { pda, bump };
    }

    getAssociatedTokenAddress(walletAddress, tokenMintAddress) {
        const { PublicKey } = solanaWeb3;
        const wallet = new PublicKey(walletAddress);
        const mint = new PublicKey(tokenMintAddress);
        const tokenProgramId = new PublicKey(EscrowClient.TOKEN_PROGRAM_ID);
        const aTokenProgramId = new PublicKey(EscrowClient.ATOKEN_PROGRAM_ID);

        const [ata] = PublicKey.findProgramAddressSync(
            [wallet.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
            aTokenProgramId
        );
        return ata;
    }

    // ── Instruction Builders ──────────────────

    /**
     * Build a create_fight transaction.
     * Creator deposits betAmount lamports into a new escrow PDA.
     */
    async buildCreateFightTx(fightId, betAmount, creatorPubkey, authorityPubkey) {
        const { PublicKey, TransactionInstruction, Transaction, SystemProgram } = solanaWeb3;

        const creator = new PublicKey(creatorPubkey);
        const authority = new PublicKey(authorityPubkey);
        const { pda: escrowPDA } = this.getFightPDA(fightId);

        // Serialize instruction data:
        // discriminator (8) + fight_id (4 + len) + bet_amount (8) + expires_in_seconds (8)
        const fightIdBytes = new TextEncoder().encode(fightId);
        const expiresIn = 900; // 15 minutes

        const data = Buffer.alloc(8 + 4 + fightIdBytes.length + 8 + 8);
        let offset = 0;

        // Discriminator
        Buffer.from(EscrowClient.IX_DISCRIMINATORS.create_fight).copy(data, offset);
        offset += 8;

        // fight_id (Borsh string: u32 len + bytes)
        data.writeUInt32LE(fightIdBytes.length, offset);
        offset += 4;
        Buffer.from(fightIdBytes).copy(data, offset);
        offset += fightIdBytes.length;

        // bet_amount (u64 LE)
        this._writeU64(data, offset, betAmount);
        offset += 8;

        // expires_in_seconds (i64 LE)
        this._writeI64(data, offset, expiresIn);
        offset += 8;

        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: escrowPDA, isSigner: false, isWritable: true },
                { pubkey: creator, isSigner: true, isWritable: true },
                { pubkey: authority, isSigner: false, isWritable: false },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: this.programId,
            data,
        });

        const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
        const tx = new Transaction({
            recentBlockhash: latestBlockhash.blockhash,
            feePayer: creator,
        }).add(instruction);

        return tx;
    }

    /**
     * Build a join_fight transaction.
     * Challenger deposits matching bet into existing escrow PDA.
     */
    async buildJoinFightTx(fightId, challengerPubkey) {
        const { PublicKey, TransactionInstruction, Transaction, SystemProgram } = solanaWeb3;

        const challenger = new PublicKey(challengerPubkey);
        const { pda: escrowPDA } = this.getFightPDA(fightId);

        // Discriminator only (no args)
        const data = Buffer.from(EscrowClient.IX_DISCRIMINATORS.join_fight);

        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: escrowPDA, isSigner: false, isWritable: true },
                { pubkey: challenger, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: this.programId,
            data,
        });

        const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
        const tx = new Transaction({
            recentBlockhash: latestBlockhash.blockhash,
            feePayer: challenger,
        }).add(instruction);

        return tx;
    }

    /**
     * Build a cancel_fight transaction.
     * Creator (or anyone after expiry) cancels and gets refunded.
     */
    async buildCancelFightTx(fightId, callerPubkey, creatorPubkey) {
        const { PublicKey, TransactionInstruction, Transaction, SystemProgram } = solanaWeb3;

        const caller = new PublicKey(callerPubkey);
        const creator = new PublicKey(creatorPubkey);
        const { pda: escrowPDA } = this.getFightPDA(fightId);

        const data = Buffer.from(EscrowClient.IX_DISCRIMINATORS.cancel_fight);

        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: escrowPDA, isSigner: false, isWritable: true },
                { pubkey: caller, isSigner: true, isWritable: true },
                { pubkey: creator, isSigner: false, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: this.programId,
            data,
        });

        const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
        const tx = new Transaction({
            recentBlockhash: latestBlockhash.blockhash,
            feePayer: caller,
        }).add(instruction);

        return tx;
    }

    // ── SPL Instruction Builders ──────────────────

    async buildCreateFightSplTx(fightId, betAmount, creatorPubkey, authorityPubkey, tokenMintPubkey) {
        const { PublicKey, TransactionInstruction, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } = solanaWeb3;

        const creator = new PublicKey(creatorPubkey);
        const authority = new PublicKey(authorityPubkey);
        const tokenMint = new PublicKey(tokenMintPubkey);
        const { pda: escrowPDA } = this.getFightPDA(fightId);
        const { pda: escrowTokenPDA } = this.getFightTokenPDA(fightId);
        
        const creatorATA = this.getAssociatedTokenAddress(creatorPubkey, tokenMintPubkey);
        const tokenProgramId = new PublicKey(EscrowClient.TOKEN_PROGRAM_ID);

        const fightIdBytes = new TextEncoder().encode(fightId);
        const expiresIn = 900;

        const data = Buffer.alloc(8 + 4 + fightIdBytes.length + 8 + 8);
        let offset = 0;

        Buffer.from(EscrowClient.IX_DISCRIMINATORS.create_fight_spl).copy(data, offset);
        offset += 8;

        data.writeUInt32LE(fightIdBytes.length, offset);
        offset += 4;
        Buffer.from(fightIdBytes).copy(data, offset);
        offset += fightIdBytes.length;

        this._writeU64(data, offset, betAmount);
        offset += 8;
        this._writeI64(data, offset, expiresIn);
        offset += 8;

        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: escrowPDA, isSigner: false, isWritable: true },
                { pubkey: creator, isSigner: true, isWritable: true },
                { pubkey: creatorATA, isSigner: false, isWritable: true },
                { pubkey: escrowTokenPDA, isSigner: false, isWritable: true },
                { pubkey: tokenMint, isSigner: false, isWritable: false },
                { pubkey: authority, isSigner: false, isWritable: false },
                { pubkey: tokenProgramId, isSigner: false, isWritable: false },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
            ],
            programId: this.programId,
            data,
        });

        const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
        const tx = new Transaction({
            recentBlockhash: latestBlockhash.blockhash,
            feePayer: creator,
        }).add(instruction);

        return tx;
    }

    async buildJoinFightSplTx(fightId, challengerPubkey, tokenMintPubkey) {
        const { PublicKey, TransactionInstruction, Transaction } = solanaWeb3;

        const challenger = new PublicKey(challengerPubkey);
        const { pda: escrowPDA } = this.getFightPDA(fightId);
        const { pda: escrowTokenPDA } = this.getFightTokenPDA(fightId);
        
        const challengerATA = this.getAssociatedTokenAddress(challengerPubkey, tokenMintPubkey);
        const tokenProgramId = new PublicKey(EscrowClient.TOKEN_PROGRAM_ID);

        const data = Buffer.from(EscrowClient.IX_DISCRIMINATORS.join_fight_spl);

        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: escrowPDA, isSigner: false, isWritable: true },
                { pubkey: challenger, isSigner: true, isWritable: true },
                { pubkey: challengerATA, isSigner: false, isWritable: true },
                { pubkey: escrowTokenPDA, isSigner: false, isWritable: true },
                { pubkey: tokenProgramId, isSigner: false, isWritable: false },
            ],
            programId: this.programId,
            data,
        });

        const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
        const tx = new Transaction({
            recentBlockhash: latestBlockhash.blockhash,
            feePayer: challenger,
        }).add(instruction);

        return tx;
    }

    async buildCancelFightSplTx(fightId, callerPubkey, creatorPubkey, tokenMintPubkey) {
        const { PublicKey, TransactionInstruction, Transaction } = solanaWeb3;

        const caller = new PublicKey(callerPubkey);
        const { pda: escrowPDA } = this.getFightPDA(fightId);
        const { pda: escrowTokenPDA } = this.getFightTokenPDA(fightId);
        
        const creatorATA = this.getAssociatedTokenAddress(creatorPubkey, tokenMintPubkey);
        const tokenProgramId = new PublicKey(EscrowClient.TOKEN_PROGRAM_ID);

        const data = Buffer.from(EscrowClient.IX_DISCRIMINATORS.cancel_fight_spl);

        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: escrowPDA, isSigner: false, isWritable: true },
                { pubkey: caller, isSigner: true, isWritable: true },
                { pubkey: escrowTokenPDA, isSigner: false, isWritable: true },
                { pubkey: creatorATA, isSigner: false, isWritable: true },
                { pubkey: tokenProgramId, isSigner: false, isWritable: false },
            ],
            programId: this.programId,
            data,
        });

        const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
        const tx = new Transaction({
            recentBlockhash: latestBlockhash.blockhash,
            feePayer: caller,
        }).add(instruction);

        return tx;
    }

    // ── On-Chain State Reader ─────────────────

    /**
     * Fetch the escrow account data for a fight.
     * Returns null if the PDA doesn't exist.
     */
    async getEscrowState(fightId) {
        const { pda } = this.getFightPDA(fightId);
        try {
            const accountInfo = await this.connection.getAccountInfo(pda);
            if (!accountInfo || !accountInfo.data) return null;

            return this._deserializeEscrow(accountInfo.data);
        } catch (e) {
            console.error('Error fetching escrow state:', e);
            return null;
        }
    }

    /**
     * Check if a specific escrow PDA has the expected balance.
     */
    async verifyEscrowBalance(fightId, expectedLamports) {
        const { pda } = this.getFightPDA(fightId);
        const balance = await this.connection.getBalance(pda);
        return balance >= expectedLamports;
    }

    // ── Serialization Helpers ─────────────────

    _writeU64(buffer, offset, value) {
        // Write a u64 as two u32s (little-endian)
        const low = value & 0xFFFFFFFF;
        const high = Math.floor(value / 0x100000000) & 0xFFFFFFFF;
        buffer.writeUInt32LE(low, offset);
        buffer.writeUInt32LE(high, offset + 4);
    }

    _writeI64(buffer, offset, value) {
        // Same as u64 for positive values
        this._writeU64(buffer, offset, value);
    }

    _readU64(buffer, offset) {
        const low = buffer.readUInt32LE(offset);
        const high = buffer.readUInt32LE(offset + 4);
        return high * 0x100000000 + low;
    }

    /**
     * Deserialize raw account data into a FightEscrow object.
     * Layout: 8 (discriminator) + borsh-serialized FightEscrow fields
     */
    _deserializeEscrow(data) {
        const buf = Buffer.from(data);
        let offset = 8; // Skip discriminator

        // fight_id (String: u32 len + bytes)
        const fightIdLen = buf.readUInt32LE(offset);
        offset += 4;
        const fightId = buf.slice(offset, offset + fightIdLen).toString('utf8');
        offset += fightIdLen;

        // creator (Pubkey: 32 bytes)
        const { PublicKey } = solanaWeb3;
        const creator = new PublicKey(buf.slice(offset, offset + 32));
        offset += 32;

        // challenger
        const challenger = new PublicKey(buf.slice(offset, offset + 32));
        offset += 32;

        // token_mint (Pubkey: 32 bytes)
        const tokenMint = new PublicKey(buf.slice(offset, offset + 32));
        offset += 32;

        // bet_amount (u64)
        const betAmount = this._readU64(buf, offset);
        offset += 8;

        // total_pot (u64)
        const totalPot = this._readU64(buf, offset);
        offset += 8;

        // status (enum: 1 byte)
        const statusByte = buf.readUInt8(offset);
        offset += 1;
        const statusMap = ['Waiting', 'Active', 'Completed', 'Cancelled'];
        const status = statusMap[statusByte] || 'Unknown';

        // authority (Pubkey)
        const authority = new PublicKey(buf.slice(offset, offset + 32));
        offset += 32;

        // fee_bps (u16)
        const feeBps = buf.readUInt16LE(offset);
        offset += 2;

        // created_at (i64)
        const createdAt = this._readU64(buf, offset);
        offset += 8;

        // expires_at (i64)
        const expiresAt = this._readU64(buf, offset);
        offset += 8;

        // bump (u8)
        const bump = buf.readUInt8(offset);

        return {
            fightId,
            creator: creator.toBase58(),
            challenger: challenger.toBase58(),
            tokenMint: tokenMint.toBase58(),
            betAmount,
            totalPot,
            status,
            authority: authority.toBase58(),
            feeBps,
            createdAt,
            expiresAt,
            bump,
            // Convenience fields
            betAmountSOL: betAmount / 1e9,
            totalPotSOL: totalPot / 1e9,
            feePercent: feeBps / 100,
            isExpired: Date.now() / 1000 > expiresAt,
        };
    }
}

// ── Global Instance ──
// Only init if solanaWeb3 is available (arena pages load it from CDN)
let escrow;
try {
    escrow = new EscrowClient();
} catch (e) {
    // Will be initialized when arena pages load
    console.log('[EscrowClient] Waiting for solanaWeb3 SDK...');
}
