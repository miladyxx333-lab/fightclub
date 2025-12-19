const translations = {
    es: {
        appTitle: "CyberPollo Arena 2.0 - Torneo Masivo",
        store: "🛒 Tienda",
        credits: "Créditos:",
        dbTitle: "Base de Datos de Combatientes (10,000)",
        searchPlaceholder: "Buscar por ID o Nombre...",
        loading: "Cargando base de datos...",
        page: "Pág",
        selectChicken: "Selecciona un Pollo",
        waiting: "Esperando combate...",
        serverSeed: "Server Seed (Oculto)",
        clientSeed: "Client Seed",
        clientSeedPlaceholder: "Tu semilla hex...",
        predict: "PREDICE EL TIRO",
        low: "BAJO (1-3)",
        high: "ALTO (4-6)",
        betSettings: "Configurar Apuesta",
        betAmount: "Monto de Apuesta",
        riskMultiplier: "Multiplicador de Riesgo:",
        winChance: "Probabilidad de Victoria:",
        potentialWin: "Ganancia Potencial:",
        startCombat: "INICIAR COMBATE",
        errorData: "Error: Datos no encontrados.",
        noFighters: "No se encontraron combatientes.",
        noCreditsWrapper: "No tienes suficientes créditos. Ve a la tienda.",
        winMsg: "¡VICTORIA! GANASTE {amount} CRÉDITOS",
        lossMsg: "DERROTA... {name} cayó ante {opponent}",
        hitMsg: "¡ACIERTO! Atacas con {dmg} de daño.",
        missMsg: "¡FALLASTE! Recibes {dmg} de daño.",
        turnStart: "¡TU TURNO! Configura tu semilla y ataca.",
        hiddenHash: "Hash Oculto (Click para revelar post-roll)",
        toggleLang: "EN",
        leaderboard: "🏆 Tabla de Líderes",
        home: "🏠 Inicio",
        rank: "Rango",
        player: "Jugador",
        score: "Créditos",
        top100: "Top 100 Combatientes",
        noUsers: "No hay usuarios registrados aún.",
        claim: "💎 Retirar",
        walletAddr: "Dirección Solana",
        claimAmount: "Monto a Retirar",
        submitClaim: "Enviar Solicitud",
        successClaim: "Solicitud enviada al admin.",
        insufficient: "Fondos insuficientes.",
        adminMsg: "Saliendo: {amount} Creds -> {wallet}",
        conversion: "Tasa: 1,000,000 Creds = 1 $SOL",
        nftMenu: "🖼️ NFTs",
        nftTitle: "Colección KillPollo NFT",
        ownFighter: "Sé dueño de tu combatiente.",
        solanaMint: "Acuñados en Solana.",
        buyNow: "Comprar en VVV.so",
        nftDesc: "Cada KillPollo es único con estadísticas generadas algorítmicamente. Úsalos en la arena para ganar más recompensas.",
        rarity: "Sistema de Rareza",
        benefits: "Beneficios de Holder",
        benefit1: "Acceso a torneos exclusivos",
        benefit2: "Multiplicador de ganancia x1.5",
        benefit3: "Airdrops de $POLLO",
        starterPack: "Pack de Inicio",
        claimBonus: "Reclamar Bono",
        nextBonus: "Próximo en:",
        bonusReady: "¡DISPONIBLE!",
        free: "Gratis",
        paymentTitle: "Pasarela de Pago",
        paymentDesc: "Se abrirá una nueva pestaña para completar tu pago seguro.",
        verify: "Confirmar Pago",
        confirmTx: "He completado el pago",
        checkTitle: "Verificando Transacción...",
        redirMsg: "Redirigiendo al proveedor de pagos...",
        openWallet: "Abrir Billetera",
        scanQr: "Escanear con Phantom/Solflare"
    },
    en: {
        appTitle: "CyberChicken Arena 2.0 - Massive Tournament",
        store: "🛒 Store",
        credits: "Credits:",
        dbTitle: "Fighter Database (10,000)",
        searchPlaceholder: "Search by ID or Name...",
        loading: "Loading database...",
        page: "Page",
        selectChicken: "Select a Chicken",
        waiting: "Waiting for combat...",
        serverSeed: "Server Seed (Hidden)",
        clientSeed: "Client Seed",
        clientSeedPlaceholder: "Your hex seed...",
        predict: "PREDICT THE ROLL",
        low: "LOW (1-3)",
        high: "HIGH (4-6)",
        betSettings: "Bet Settings",
        betAmount: "Bet Amount",
        riskMultiplier: "Risk Multiplier:",
        winChance: "Win Probability:",
        potentialWin: "Potential Win:",
        startCombat: "START COMBAT",
        errorData: "Error: Data not found.",
        noFighters: "No fighters found.",
        noCreditsWrapper: "Not enough credits. Go to store.",
        winMsg: "VICTORY! YOU WON {amount} CREDITS",
        lossMsg: "DEFEAT... {name} fell to {opponent}",
        hitMsg: "HIT! You deal {dmg} damage.",
        missMsg: "MISS! You take {dmg} damage.",
        turnStart: "YOUR TURN! Set seed and attack.",
        hiddenHash: "Hidden Hash (Click to reveal post-roll)",
        toggleLang: "ES",
        leaderboard: "🏆 Leaderboard",
        home: "🏠 Home",
        rank: "Rank",
        player: "Player",
        score: "Credits",
        top100: "Top 100 Fighters",
        noUsers: "No users registered yet.",
        claim: "💎 Withdraw",
        walletAddr: "Solana Address",
        claimAmount: "Withdraw Amount",
        submitClaim: "Submit Request",
        successClaim: "Request sent to admin.",
        insufficient: "Insufficient funds.",
        adminMsg: "Outgoing: {amount} Creds -> {wallet}",
        conversion: "Rate: 1,000,000 Creds = 1 $SOL",
        nftMenu: "🖼️ NFTs",
        nftTitle: "KillPollo NFT Collection",
        ownFighter: "Own your fighter.",
        solanaMint: "Minted on Solana.",
        buyNow: "Buy on VVV.so",
        nftDesc: "Each KillPollo is unique with algorithmically generated stats. Use them in the arena to earn higher rewards.",
        rarity: "Rarity System",
        benefits: "Holder Benefits",
        benefit1: "Access to exclusive tournaments",
        benefit2: "x1.5 Earning Multiplier",
        benefit3: "$POLLO Airdrops",
        starterPack: "Starter Pack",
        claimBonus: "Claim Bonus",
        nextBonus: "Next Claim:",
        bonusReady: "READY!",
        free: "Free",
        paymentTitle: "Payment Gateway",
        paymentDesc: "A new tab will open to complete your secure payment.",
        verify: "Confirm Payment",
        confirmTx: "I have completed payment",
        checkTitle: "Verifying Transaction...",
        redirMsg: "Redirecting to payment provider...",
        openWallet: "Open Wallet",
        scanQr: "Scan with Phantom/Solflare"
    }
};

let currentLang = 'es';

function t(key, params = {}) {
    let str = translations[currentLang][key] || key;
    Object.keys(params).forEach(param => {
        str = str.replace(`{${param}}`, params[param]);
    });
    return str;
}

function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLang = lang;
    localStorage.setItem('cyberpollo_lang', lang);

    // Update all static elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            // Handle placeholders if any? Static text usually doesn't have them in this simple impl
            if (el.tagName === 'INPUT' && el.getAttribute('placeholder')) {
                el.placeholder = translations[lang][key];
            } else {
                el.textContent = translations[lang][key];
            }
        }
    });

    // Update specific placeholders that might not be caught
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.placeholder = t('searchPlaceholder');

    const clientSeed = document.getElementById('client-seed-input');
    if (clientSeed) clientSeed.placeholder = t('clientSeedPlaceholder');

    // Update toggle button text
    const langBtn = document.getElementById('lang-toggle');
    if (langBtn) {
        langBtn.textContent = lang === 'es' ? '🇺🇸 EN' : '🇲🇽 ES';
    }

    // Trigger UI updates that might need re-rendering text (like logs or active game text if we wanted to go that deep, 
    // but for now we'll just handle static)
}

// Initialize immediately if script loaded
const savedLang = localStorage.getItem('cyberpollo_lang') || 'es';
currentLang = savedLang;
// We can't run setLanguage fully until DOM is ready, but we set the var.
