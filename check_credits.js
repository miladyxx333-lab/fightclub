const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCredits() {
    console.log("Checking user credits...");
    const { data, error } = await supabase
        .from('game_users')
        .select('id, wallet_address, credits');

    if (error) {
        console.error("Error fetching users:", error.message);
    } else {
        console.log("Users found:", data.length);
        console.table(data);
    }
}

checkCredits();
