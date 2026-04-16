# FightClub — Idea Context

## Project Name
CyberPollo Arena (FightClub)

## One-Liner
A PvP betting arena on Solana where players fight using KillPollo NFTs via dice-based combat, with real SOL wagering and provably fair outcomes.

## Problem
On-chain PvP gaming with real stakes is fragmented — most projects either use centralized escrow (trust-the-house) or have terrible UX. There's no simple "connect wallet → pick fighter → bet → fight" experience on Solana.

## Solution
A gamified PvP arena where:
- 10,000 KillPollo NFTs serve as fighter avatars
- Players wager SOL (and soon SPL tokens) on dice combat
- PDA-based escrow ensures trustless fund management  
- 3% house fee sustains the platform
- Supabase Realtime powers instant lobby updates

## Target Users
- Solana degens who enjoy PvP wagering
- KillPollo NFT holders looking for utility
- On-chain gaming enthusiasts

## Tech Stack
- Frontend: Vanilla HTML/CSS/JS (Cyberpunk aesthetic)
- Backend: Vercel Serverless + Supabase
- Blockchain: Solana (Anchor programs)
- Wallets: Phantom, Solflare, Backpack

## Current Status
- ✅ Solo combat game with credit-based betting
- ✅ P2P Arena lobby with Supabase Realtime
- ✅ Solana Pay integration (store)
- ✅ Wallet-native auth (Phase 1 complete)
- 🔜 On-chain escrow (Phase 2)
- 🔜 VRF randomness (Phase 3)
- 🔜 SPL token support (Phase 4)

## Revenue Model
3% fee on every P2P fight payout
