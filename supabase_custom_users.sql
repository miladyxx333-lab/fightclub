
-- 1. Crear tabla de usuarios personalizada (Estilo Meximarket)
-- Esta tabla NO está vinculada al sistema de Auth de Supabase para tener control total
create table public.game_users (
  id uuid default uuid_generate_v4() primary key,
  username text unique not null,
  password text not null, -- En producción esto debería ser hasheado
  credits bigint default 100,
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

-- Bloqueamos el UPDATE directo desde el cliente (DevTools)
create policy "Disable update for all users"
  on public.game_users for update
  using (false);

-- 4. Funciones Seguras (RPC) para manejar créditos
-- Función para añadir créditos de forma segura
create or replace function add_credits_secure(p_user_id uuid, p_password text, p_amount bigint)
returns boolean
language plpgsql
security definer
as $$
declare
  v_user record;
begin
  -- Verificar credenciales
  select id into v_user from public.game_users
  where id = p_user_id and password = p_password;

  if not found then
    return false;
  end if;

  -- Actualizar
  update public.game_users
  set credits = credits + p_amount
  where id = p_user_id;

  return true;
end;
$$;

-- Función para gastar/restar créditos de forma segura
create or replace function deduct_credits_secure(p_user_id uuid, p_password text, p_amount bigint)
returns boolean
language plpgsql
security definer
as $$
declare
  v_user record;
  current_credits bigint;
begin
  -- Verificar credenciales y traer saldo actual
  select id, credits into v_user from public.game_users
  where id = p_user_id and password = p_password;

  if not found then
    return false;
  end if;

  if v_user.credits < p_amount then
    return false; -- Fondos insuficientes
  end if;

  -- Actualizar
  update public.game_users
  set credits = credits - p_amount
  where id = p_user_id;

  return true;
end;
$$;
