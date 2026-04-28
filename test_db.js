const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testConnection() {
    console.log("Checking arena_fights table...");
    const { data, error } = await supabase
        .from('arena_fights')
        .select('id, status')
        .limit(5);

    if (error) {
        console.error("Error fetching arena_fights:", error.message);
        if (error.code === '42P01') {
            console.log("Table 'arena_fights' DOES NOT EXIST. Migration needed.");
        }
    } else {
        console.log("Success! Table exists. Fights found:", data.length);
        console.log(data);
    }
}

testConnection();
