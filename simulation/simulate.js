const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws'); // Required for Supabase realtime in Node
global.WebSocket = WebSocket;

const SUPABASE_URL = 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function calculateRoll(serverSeed, clientSeed) {
    const combined = serverSeed + clientSeed;
    let hashVal = 0;
    for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hashVal = ((hashVal << 5) - hashVal) + char;
        hashVal = hashVal & hashVal;
    }
    return (Math.abs(hashVal) % 6) + 1;
}

async function runSimulation() {
    console.log("🚀 Iniciando Simulación de P2P Arena...");

    try {
        // 1. Bypass db check in this simulation to just show the math
        // const { data: test, error: testErr } = await supabase.from('arena_fights').select('id').limit(1);
        // }

        console.log("✅ Tablas de base de datos verificadas (Simulado por ahora).");

        // 2. Jugador A: Crea una pelea
        console.log("\n🐓 [JUGADOR A]: Creando una pelea por 100 BONK...");
        /* 
        const { data: fight, error: createErr } = await supabase...
        */
        const fightId = "fight_0xsimulado";
        console.log(`✅ [JUGADOR A]: Pelea creada con ID: ${fightId}... Esperando al retador.`);

        // 3. Jugador B: Se une a la pelea
        console.log(`\n🥚 [JUGADOR B]: Uniéndose a la pelea ${fightId}...`);
        /*
        await supabase... update
        */
        console.log("✅ [JUGADOR B]: ¡Te has unido a la pelea! ¡COMBATE INICIADO!");

        // 4. Iniciar simulación por turnos local (sin wallets reales)
        console.log("\n⚔️ --- ¡INICIA EL COMBATE P2P! --- ⚔️");
        
        // Simular canal de comunicacion en tiempo real local
        let hpA = 100;
        let hpB = 100;
        let isTurnA = true;
        let baseDamage = 20;

        for (let round = 1; round <= 10; round++) {
            console.log(`\n🥊 ROUND ${round}`);
            
            const currentPlayer = isTurnA ? "JUGADOR A" : "JUGADOR B";
            const currentOpponent = isTurnA ? "JUGADOR B" : "JUGADOR A";
            
            console.log(`> Turno de [${currentPlayer}]...`);
            await sleep(1000); // Simulando tiempo de pensar
            
            const predictedLow = Math.random() > 0.5; // Elige bajo o alto aleatoriamente
            console.log(`[${currentPlayer}] predice: ${predictedLow ? "BAJO (1-3)" : "ALTO (4-6)"}`);
            
            const serverSeed = Math.random().toString(36).substring(7);
            const roll = calculateRoll(serverSeed, "simClient");
            
            console.log(`🎲 Rodando los dados... ¡SALIÓ: ${roll}!`);
            
            const isLow = roll <= 3;
            const hit = (predictedLow && isLow) || (!predictedLow && !isLow);
            
            if (hit) {
                const crit = (roll === 1 || roll === 6) ? 1.5 : 1;
                const damage = Math.floor(baseDamage * crit);
                
                if (isTurnA) {
                    hpB = Math.max(0, hpB - damage);
                } else {
                    hpA = Math.max(0, hpA - damage);
                }
                
                console.log(`💥 ¡ACIERTO! [${currentPlayer}] hace ${damage} de daño ${crit > 1 ? "(CRÍTICO)" : ""}.`);
            } else {
                const counter = Math.floor(baseDamage * 0.8);
                if (isTurnA) {
                    hpA = Math.max(0, hpA - counter);
                } else {
                    hpB = Math.max(0, hpB - counter);
                }
                console.log(`🛡️ ¡FALLÓ! [${currentPlayer}] resbala y [${currentOpponent}] le hace un contraataque de ${counter} de daño.`);
            }

            console.log(`📊 HP Actual: [JUGADOR A]: ${hpA}  --vs--  [JUGADOR B]: ${hpB}`);

            // Fin del combate
            if (hpA <= 0 || hpB <= 0) {
                const winner = hpA > 0 ? "JUGADOR A" : "JUGADOR B";
                console.log(`\n🏆 EL COMBATE TERMINÓ. ¡GANADOR: [${winner}]!`);
                
                // Actualizar info final
                /* await supabase.update... */
                console.log("✅ Base de datos actualizada con el final de la pelea.");
                break;
            }

            // Cambiar de turno si nadie ha muerto
            isTurnA = !isTurnA;
            await sleep(1500); // Pausa entre turnos
        }

    } catch (e) {
        console.error("\n❌ Error Crítico durante la simulación:", e);
    }
}

runSimulation();
