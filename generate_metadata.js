const fs = require('fs');

const names = ['Pollo', 'Gallo', 'Kikiriki', 'Plumas', 'Pico', 'Destructor', 'Titan', 'Cyber', 'Neon', 'Robo'];
const adjs = ['Furioso', 'Veloz', 'Blindado', 'Letal', 'Supremo', 'Omega', 'Alpha', 'Bionico', 'Nuclear', 'Satanico'];
const images = ['assets/chicken1.png', 'assets/chicken2.png', 'assets/chicken3.png'];

const chickens = [];

for (let i = 1; i <= 10000; i++) {
    const name = names[Math.floor(Math.random() * names.length)] + ' ' + adjs[Math.floor(Math.random() * adjs.length)] + ' ' + i;
    const img = images[Math.floor(Math.random() * images.length)];

    chickens.push({
        id: i,
        name: name,
        image: img,
        stats: {
            strength: Math.floor(Math.random() * 50) + 50,
            speed: Math.floor(Math.random() * 50) + 50,
            defense: Math.floor(Math.random() * 50) + 50
        }
    });
}

const content = `window.chickenData = ${JSON.stringify(chickens, null, 2)};`;
fs.writeFileSync('assets/metadata.js', content);
console.log('Metadata generated as JS file for local access.');
