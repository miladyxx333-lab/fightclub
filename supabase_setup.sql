
-- 1. Habilitar UUIDs (por si acaso)
create extension if not exists "uuid-ossp";

-- 2. Crear tabla de perfiles (vinculada a auth.users de Supabase)
create table public.profiles (
  id uuid references auth.users not null primary key,
  username text unique,
  credits bigint default 1000,
  created_at timestamptz default now()
);

-- 3. Habilitar seguridad (RLS)
alter table public.profiles enable row level security;

-- 4. Pólizas de acceso (Reglas de seguridad)
-- Permite que cualquiera vea perfiles (necesario para ver oponentes, tabla de líderes, etc.)
create policy "Public profiles are viewable by everyone"
  on profiles for select
  using ( true );

-- Permite que el usuario edite SÓLO su propio perfil
create policy "Users can update own profile"
  on profiles for update
  using ( auth.uid() = id );

-- 5. Función automática para crear perfil al registrarse
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, credits)
  values (new.id, new.raw_user_meta_data->>'username', 1000);
  return new;
end;
$$ language plpgsql security definer;

-- 6. Trigger que dispara la función anterior
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 7. (Opcional) Tabla de Transacciones para historial
create table public.transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id),
  amount bigint not null,
  type text not null, -- 'bet_win', 'bet_loss', 'deposit', 'withdraw'
  created_at timestamptz default now()
);

alter table public.transactions enable row level security;

create policy "Users can view own transactions"
  on transactions for select
  using ( auth.uid() = user_id );

-- Permitir insertar transacciones (el backend o lógica segura debería manejar esto, 
-- pero para este MVP permitiremos insert desde cliente autenticado para apuestas)
create policy "Users can insert own transactions"
  on transactions for insert
  with check ( auth.uid() = user_id );
