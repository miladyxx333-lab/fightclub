const fs = require('fs');
const path = require('path');

const METADATA_DIR = '/Users/urielhernandez/Desktop/pollos/metadata';
const OUTPUT_FILE = 'assets/metadata.js';
const TOTAL_POLLOS = 10000;

const processedChickens = [];

console.log(`Starting import of ${TOTAL_POLLOS} chickens from ${METADATA_DIR}...`);

for (let i = 0; i < TOTAL_POLLOS; i++) {
    const filePath = path.join(METADATA_DIR, `${i}.json`);

    if (fs.existsSync(filePath)) {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(fileContent);

            // Simulating combat stats based on randomness (or hash of name)
            // Real metadata doesn't have combat stats, so we improvise for the game
            const strength = Math.floor(Math.random() * 50) + 50;
            const speed = Math.floor(Math.random() * 50) + 50;
            const defense = Math.floor(Math.random() * 50) + 50;

            processedChickens.push({
                id: i,
                name: data.name,
                // Assuming images are moved to standard local folder
                image: `assets/images/${i}.jpeg`,
                original_attributes: data.attributes,
                stats: {
                    strength,
                    speed,
                    defense
                }
            });
        } catch (err) {
            console.error(`Error reading ${i}.json`, err.message);
        }
    } else {
        // console.warn(`Missing file: ${i}.json`);
    }

    if (i % 1000 === 0) process.stdout.write('.');
}

const jsContent = `window.chickenData = ${JSON.stringify(processedChickens, null, 2)};`;
fs.writeFileSync(OUTPUT_FILE, jsContent);

console.log(`\nSuccessfully imported ${processedChickens.length} chickens to ${OUTPUT_FILE}`);
