
-- Tabla para rastrear órdenes de pago con Solana Pay
create table public.payment_orders (
  id text primary key, -- El ID de la orden (ORDER_...)
  wallet text not null, -- Wallet destino
  amount_usd numeric,
  amount_sol numeric,
  status text default 'pending', -- pending, paid
  memo text, -- El memo único para rastrear en blockchain
  created_at timestamptz default now(),
  paid_at timestamptz,
  signature text -- La firma de la transacción en Solana si se confirma
);

-- Habilitar RLS
alter table public.payment_orders enable row level security;

-- Permitir lectura pública (o restringir según prefieras, pero público facilita check-payment)
create policy "Public read orders"
  on public.payment_orders for select
  using (true);

-- Permitir insertar (desde el backend o cliente autenticado)
create policy "Insert orders"
  on public.payment_orders for insert
  with check (true);

-- Permitir updates (para marcar como pagado)
create policy "Update orders"
  on public.payment_orders for update
  using (true);
