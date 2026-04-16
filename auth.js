// ============================================
// AUTH LEGACY — DEPRECATED
// ============================================
// This file has been superseded by auth_supabase.js (v3)
// which uses wallet-native authentication.
//
// This file is kept for backward compatibility only.
// All pages should now load auth_supabase.js instead.
//
// If any page still loads this file, it creates a 
// minimal shim that delegates to the new auth system.
// ============================================

if (typeof AuthSystem === 'undefined') {
    console.warn('[AUTH] Legacy auth.js loaded. This is deprecated. Use auth_supabase.js instead.');
    
    class AuthSystem {
        constructor() {
            this.currentUser = JSON.parse(localStorage.getItem('cp_wallet_user'));
        }
        getCurrentUser() { return this.currentUser; }
        requireAuth() {
            if (!this.currentUser) window.location.href = 'login.html';
        }
        logout() {
            localStorage.removeItem('cp_wallet_user');
            window.location.href = 'login.html';
        }
        addCredits() { console.warn('Legacy addCredits called — no-op'); }
        deductCredits() { console.warn('Legacy deductCredits called — no-op'); return false; }
    }
    
    if (typeof auth === 'undefined') {
        const auth = new AuthSystem();
    }
}
