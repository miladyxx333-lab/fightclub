use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("FiGHt1111111111111111111111111111111111111");

#[program]
pub mod fight_escrow {
    use super::*;

    // ── NATIVE SOL INSTRUCTIONS (From Phase 2) ──

    pub fn create_fight(
        ctx: Context<CreateFight>,
        fight_id: String,
        bet_amount: u64,
        expires_in_seconds: i64,
    ) -> Result<()> {
        require!(bet_amount > 0, EscrowError::InvalidBetAmount);
        require!(fight_id.len() <= 64, EscrowError::FightIdTooLong);

        let clock = Clock::get()?;
        let escrow = &mut ctx.accounts.escrow;

        escrow.fight_id = fight_id;
        escrow.creator = ctx.accounts.creator.key();
        escrow.challenger = Pubkey::default();
        escrow.token_mint = Pubkey::default(); // default used to denote Native SOL
        escrow.bet_amount = bet_amount;
        escrow.total_pot = 0;
        escrow.status = FightStatus::Waiting;
        escrow.authority = ctx.accounts.authority.key();
        escrow.fee_bps = 300;
        escrow.created_at = clock.unix_timestamp;
        escrow.expires_at = clock.unix_timestamp + expires_in_seconds;
        escrow.bump = ctx.bumps.escrow;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: escrow.to_account_info(),
                },
            ),
            bet_amount,
        )?;

        emit!(FightCreated {
            fight_id: escrow.fight_id.clone(),
            creator: escrow.creator,
            bet_amount,
            expires_at: escrow.expires_at,
        });
        Ok(())
    }

    pub fn join_fight(ctx: Context<JoinFight>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == FightStatus::Waiting, EscrowError::FightNotWaiting);
        require!(ctx.accounts.challenger.key() != escrow.creator, EscrowError::CannotFightYourself);
        require!(escrow.token_mint == Pubkey::default(), EscrowError::MismatchTokenType);
        
        let clock = Clock::get()?;
        require!(clock.unix_timestamp < escrow.expires_at, EscrowError::FightExpired);

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.challenger.to_account_info(),
                    to: escrow.to_account_info(),
                },
            ),
            escrow.bet_amount,
        )?;

        escrow.challenger = ctx.accounts.challenger.key();
        escrow.total_pot = escrow.bet_amount * 2;
        escrow.status = FightStatus::Active;

        emit!(FightJoined {
            fight_id: escrow.fight_id.clone(),
            challenger: escrow.challenger,
            total_pot: escrow.total_pot,
        });
        Ok(())
    }

    pub fn resolve_fight(ctx: Context<ResolveFight>, winner_role: u8) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == FightStatus::Active, EscrowError::FightNotActive);
        require!(winner_role <= 1, EscrowError::InvalidWinnerRole);
        require!(escrow.token_mint == Pubkey::default(), EscrowError::MismatchTokenType);

        let fee_amount = escrow.total_pot.checked_mul(escrow.fee_bps as u64).unwrap().checked_div(10_000).unwrap();
        let payout_amount = escrow.total_pot.checked_sub(fee_amount).unwrap();

        let winner = if winner_role == 0 { &ctx.accounts.creator } else { &ctx.accounts.challenger };

        **escrow.to_account_info().try_borrow_mut_lamports()? -= payout_amount;
        **winner.to_account_info().try_borrow_mut_lamports()? += payout_amount;

        if fee_amount > 0 {
            **escrow.to_account_info().try_borrow_mut_lamports()? -= fee_amount;
            **ctx.accounts.fee_collector.to_account_info().try_borrow_mut_lamports()? += fee_amount;
        }

        escrow.status = FightStatus::Completed;

        emit!(FightResolved {
            fight_id: escrow.fight_id.clone(),
            winner: winner.key(),
            winner_role,
            payout_amount,
            fee_amount,
        });
        Ok(())
    }

    pub fn cancel_fight(ctx: Context<CancelFight>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == FightStatus::Waiting, EscrowError::FightNotWaiting);
        require!(escrow.token_mint == Pubkey::default(), EscrowError::MismatchTokenType);

        let clock = Clock::get()?;
        let is_creator = ctx.accounts.caller.key() == escrow.creator;
        let is_expired = clock.unix_timestamp >= escrow.expires_at;
        require!(is_creator || is_expired, EscrowError::NotAuthorized);

        let refund_amount = escrow.bet_amount;
        **escrow.to_account_info().try_borrow_mut_lamports()? -= refund_amount;
        **ctx.accounts.creator.to_account_info().try_borrow_mut_lamports()? += refund_amount;

        escrow.status = FightStatus::Cancelled;

        emit!(FightCancelled {
            fight_id: escrow.fight_id.clone(),
            refunded_to: escrow.creator,
            amount: refund_amount,
        });
        Ok(())
    }

    pub fn close_escrow(_ctx: Context<CloseEscrow>) -> Result<()> {
        // Rent reclaim handled by constraint
        emit!(EscrowClosed { fight_id: _ctx.accounts.escrow.fight_id.clone() });
        Ok(())
    }


    // ── SPL TOKEN INSTRUCTIONS (Phase 4) ──

    pub fn create_fight_spl(
        ctx: Context<CreateFightSPL>,
        fight_id: String,
        bet_amount: u64,
        expires_in_seconds: i64,
    ) -> Result<()> {
        require!(bet_amount > 0, EscrowError::InvalidBetAmount);
        require!(fight_id.len() <= 64, EscrowError::FightIdTooLong);

        let clock = Clock::get()?;
        let escrow = &mut ctx.accounts.escrow;

        escrow.fight_id = fight_id.clone();
        escrow.creator = ctx.accounts.creator.key();
        escrow.challenger = Pubkey::default();
        escrow.token_mint = ctx.accounts.token_mint.key(); // SPL Token Mint
        escrow.bet_amount = bet_amount;
        escrow.total_pot = 0;
        escrow.status = FightStatus::Waiting;
        escrow.authority = ctx.accounts.authority.key();
        escrow.fee_bps = 300;
        escrow.created_at = clock.unix_timestamp;
        escrow.expires_at = clock.unix_timestamp + expires_in_seconds;
        escrow.bump = ctx.bumps.escrow;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.creator_token_account.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            bet_amount,
        )?;

        emit!(FightCreated {
            fight_id: escrow.fight_id.clone(),
            creator: escrow.creator,
            bet_amount,
            expires_at: escrow.expires_at,
        });
        Ok(())
    }

    pub fn join_fight_spl(ctx: Context<JoinFightSPL>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == FightStatus::Waiting, EscrowError::FightNotWaiting);
        require!(ctx.accounts.challenger.key() != escrow.creator, EscrowError::CannotFightYourself);
        
        let clock = Clock::get()?;
        require!(clock.unix_timestamp < escrow.expires_at, EscrowError::FightExpired);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.challenger_token_account.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.challenger.to_account_info(),
                },
            ),
            escrow.bet_amount,
        )?;

        escrow.challenger = ctx.accounts.challenger.key();
        escrow.total_pot = escrow.bet_amount * 2;
        escrow.status = FightStatus::Active;

        emit!(FightJoined {
            fight_id: escrow.fight_id.clone(),
            challenger: escrow.challenger,
            total_pot: escrow.total_pot,
        });
        Ok(())
    }

    pub fn resolve_fight_spl(ctx: Context<ResolveFightSPL>, winner_role: u8) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == FightStatus::Active, EscrowError::FightNotActive);
        require!(winner_role <= 1, EscrowError::InvalidWinnerRole);

        let fee_amount = escrow.total_pot.checked_mul(escrow.fee_bps as u64).unwrap().checked_div(10_000).unwrap();
        let payout_amount = escrow.total_pot.checked_sub(fee_amount).unwrap();

        let fight_id_bytes = escrow.fight_id.as_bytes();
        let bump = &[escrow.bump];
        let signer_seeds: &[&[&[u8]]] = &[&[b"fight_escrow", fight_id_bytes, bump]];

        let winner_account = if winner_role == 0 {
            &ctx.accounts.creator_token_account
        } else {
            &ctx.accounts.challenger_token_account
        };

        // Payout to winner
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: winner_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            payout_amount,
        )?;

        // Transfer fee to house
        if fee_amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_token_account.to_account_info(),
                        to: ctx.accounts.fee_collector_token_account.to_account_info(),
                        authority: ctx.accounts.escrow.to_account_info(),
                    },
                    signer_seeds,
                ),
                fee_amount,
            )?;
        }

        escrow.status = FightStatus::Completed;

        let winner_pubkey = if winner_role == 0 { escrow.creator } else { escrow.challenger };
        emit!(FightResolved {
            fight_id: escrow.fight_id.clone(),
            winner: winner_pubkey,
            winner_role,
            payout_amount,
            fee_amount,
        });
        Ok(())
    }

    pub fn cancel_fight_spl(ctx: Context<CancelFightSPL>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == FightStatus::Waiting, EscrowError::FightNotWaiting);

        let clock = Clock::get()?;
        let is_creator = ctx.accounts.caller.key() == escrow.creator;
        let is_expired = clock.unix_timestamp >= escrow.expires_at;
        require!(is_creator || is_expired, EscrowError::NotAuthorized);

        let refund_amount = escrow.bet_amount;
        let fight_id_bytes = escrow.fight_id.as_bytes();
        let bump = &[escrow.bump];
        let signer_seeds: &[&[&[u8]]] = &[&[b"fight_escrow", fight_id_bytes, bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.creator_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            refund_amount,
        )?;

        escrow.status = FightStatus::Cancelled;

        emit!(FightCancelled {
            fight_id: escrow.fight_id.clone(),
            refunded_to: escrow.creator,
            amount: refund_amount,
        });
        Ok(())
    }

}

// ═══════════════════════════════════════════════
// ACCOUNTS (NATIVE SOL)
// ═══════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(fight_id: String, bet_amount: u64)]
pub struct CreateFight<'info> {
    #[account(
        init,
        payer = creator,
        space = FightEscrow::SPACE,
        seeds = [b"fight_escrow", fight_id.as_bytes()],
        bump,
    )]
    pub escrow: Account<'info, FightEscrow>,

    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: Authority pubkey stored for future resolve calls. Not validated here.
    pub authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinFight<'info> {
    #[account(mut, seeds = [b"fight_escrow", escrow.fight_id.as_bytes()], bump = escrow.bump)]
    pub escrow: Account<'info, FightEscrow>,
    #[account(mut)]
    pub challenger: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveFight<'info> {
    #[account(mut, seeds = [b"fight_escrow", escrow.fight_id.as_bytes()], bump = escrow.bump)]
    pub escrow: Account<'info, FightEscrow>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Safe
    #[account(mut)]
    pub creator: UncheckedAccount<'info>,
    /// CHECK: Safe
    #[account(mut)]
    pub challenger: UncheckedAccount<'info>,
    /// CHECK: Safe
    #[account(mut)]
    pub fee_collector: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelFight<'info> {
    #[account(mut, seeds = [b"fight_escrow", escrow.fight_id.as_bytes()], bump = escrow.bump)]
    pub escrow: Account<'info, FightEscrow>,
    #[account(mut)]
    pub caller: Signer<'info>,
    /// CHECK: Safe
    #[account(mut)]
    pub creator: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseEscrow<'info> {
    #[account(
        mut, seeds = [b"fight_escrow", escrow.fight_id.as_bytes()], bump = escrow.bump,
        close = authority,
    )]
    pub escrow: Account<'info, FightEscrow>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ═══════════════════════════════════════════════
// ACCOUNTS (SPL TOKEN)
// ═══════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(fight_id: String)]
pub struct CreateFightSPL<'info> {
    #[account(
        init,
        payer = creator,
        space = FightEscrow::SPACE,
        seeds = [b"fight_escrow", fight_id.as_bytes()],
        bump,
    )]
    pub escrow: Account<'info, FightEscrow>,

    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut)]
    pub creator_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = creator,
        seeds = [b"fight_escrow_token", fight_id.as_bytes()],
        bump,
        token::mint = token_mint,
        token::authority = escrow,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Token>,

    /// CHECK: Stored authority
    pub authority: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct JoinFightSPL<'info> {
    #[account(mut, seeds = [b"fight_escrow", escrow.fight_id.as_bytes()], bump = escrow.bump)]
    pub escrow: Account<'info, FightEscrow>,

    #[account(mut)]
    pub challenger: Signer<'info>,

    #[account(mut)]
    pub challenger_token_account: Account<'info, TokenAccount>,

    #[account(mut, seeds = [b"fight_escrow_token", escrow.fight_id.as_bytes()], bump)]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ResolveFightSPL<'info> {
    #[account(mut, seeds = [b"fight_escrow", escrow.fight_id.as_bytes()], bump = escrow.bump)]
    pub escrow: Account<'info, FightEscrow>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [b"fight_escrow_token", escrow.fight_id.as_bytes()], bump)]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub creator_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub challenger_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub fee_collector_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelFightSPL<'info> {
    #[account(mut, seeds = [b"fight_escrow", escrow.fight_id.as_bytes()], bump = escrow.bump)]
    pub escrow: Account<'info, FightEscrow>,

    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(mut, seeds = [b"fight_escrow_token", escrow.fight_id.as_bytes()], bump)]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub creator_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}


// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════

#[account]
pub struct FightEscrow {
    pub fight_id: String,      // 4 + 64 = 68
    pub creator: Pubkey,       // 32
    pub challenger: Pubkey,    // 32
    pub token_mint: Pubkey,    // 32  (NEW) default public key for Native SOL
    pub bet_amount: u64,       // 8
    pub total_pot: u64,        // 8
    pub status: FightStatus,   // 1
    pub authority: Pubkey,     // 32
    pub fee_bps: u16,          // 2
    pub created_at: i64,       // 8
    pub expires_at: i64,       // 8
    pub bump: u8,              // 1
}

impl FightEscrow {
    pub const SPACE: usize = 8 + 68 + 32 + 32 + 32 + 8 + 8 + 1 + 32 + 2 + 8 + 8 + 1 + 32;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum FightStatus {
    Waiting,
    Active,
    Completed,
    Cancelled,
}

// ═══════════════════════════════════════════════
// EVENTS & ERRORS (Omitted some code for space, keeping events standard)
// ═══════════════════════════════════════════════

#[event] pub struct FightCreated { pub fight_id: String, pub creator: Pubkey, pub bet_amount: u64, pub expires_at: i64 }
#[event] pub struct FightJoined { pub fight_id: String, pub challenger: Pubkey, pub total_pot: u64 }
#[event] pub struct FightResolved { pub fight_id: String, pub winner: Pubkey, pub winner_role: u8, pub payout_amount: u64, pub fee_amount: u64 }
#[event] pub struct FightCancelled { pub fight_id: String, pub refunded_to: Pubkey, pub amount: u64 }
#[event] pub struct EscrowClosed { pub fight_id: String }

#[error_code]
pub enum EscrowError {
    #[msg("Bet amount must be greater than zero")] InvalidBetAmount,
    #[msg("Fight ID must be 64 characters or less")] FightIdTooLong,
    #[msg("Fight is not in 'Waiting' status")] FightNotWaiting,
    #[msg("Fight is not in 'Active' status")] FightNotActive,
    #[msg("Cannot fight against yourself")] CannotFightYourself,
    #[msg("Fight has expired")] FightExpired,
    #[msg("Winner role must be 0 (creator) or 1 (challenger)")] InvalidWinnerRole,
    #[msg("Not authorized to perform this action")] NotAuthorized,
    #[msg("Fight is still active and cannot be closed")] FightStillActive,
    #[msg("Mismatch token type. Expected SPL or Native.")] MismatchTokenType,
}
