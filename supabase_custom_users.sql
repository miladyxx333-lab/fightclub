
-- 1. Crear tabla de usuarios personalizada (Estilo Meximarket)
-- Esta tabla NO está vinculada al sistema de Auth de Supabase para tener control total
create table public.game_users (
  id uuid default uuid_generate_v4() primary key,
  username text unique not null,
  password text not null, -- En producción esto debería ser hasheado
  credits bigint default 1000,
  created_at timestamptz default now()
);

-- 2. Habilitar seguridad (RLS)
alter table public.game_users enable row level security;

-- 3. Políticas de acceso (Simples para MVP)
-- Permitir lectura pública (para verificar login y ver perfiles en leaderboard)
create policy "Enable read access for all users"
  on public.game_users for select
  using (true);

-- Permitir inserción pública (para registro)
create policy "Enable insert for all users"
  on public.game_users for insert
  with check (true);

-- Permitir actualización pública (para restar créditos/sumar victorias)
-- NOTA: Esto es inseguro para prod real, pero funcional para este MVP local
create policy "Enable update for all users"
  on public.game_users for update
  using (true);
