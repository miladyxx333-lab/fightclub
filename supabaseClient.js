
// CLIENTE DE SUPABASE
// -------------------------------------------------------------------
// IMPORTANTE: Reemplaza con tus propias claves de tu proyecto Supabase.
// Puedes encontrarlas en: Settings -> API
// -------------------------------------------------------------------

const SUPABASE_URL = 'https://hpebvddocrfqtkbvqusk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZWJ2ZGRvY3JmcXRrYnZxdXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzMwNzEsImV4cCI6MjA4MTc0OTA3MX0.byPXz6lvRFH81273qhHLI5H5QUxutYA0z7nGh1GTCdg';

// Inicializar cliente (asume que el script de supabase-js se cargó desde CDN en el HTML)
// El CDN expone 'supabase' como un objeto con createClient.
// Usamos una variable intermedia para no sombrear la global antes de usarla.
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exponemos el cliente inicializado como variable global 'supabase' para todo el proyecto
window.supabase = client;

console.log("Supabase Client Initialized and attached to window.supabase");
