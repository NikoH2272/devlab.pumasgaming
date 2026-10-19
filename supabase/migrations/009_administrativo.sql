-- ============================================================
-- PUMAS DEV LAB · 009 · Módulo Administrativo
-- ------------------------------------------------------------
-- Ejecutar en Supabase > SQL Editor (después de 008).
--
-- Una sola tabla para todo lo administrativo de cada organización:
--   perfil       datos del equipo (redes, fundación, presupuesto mensual)
--   miembro      ficha de un miembro: usuario del sistema, jugador o
--                externo (editor, diseñador…): contacto y sueldo en USD
--   metodo_pago  PayPal, Binance, transferencia…
--   movimiento   ingreso o egreso en USD
--   torneo       torneo con fases, premio y top alcanzado
--   relampago    relámpago: corp, costo, top y premio
--   calendario   código secreto del calendario compartido (Google Calendar)
--
-- Lo ven y lo editan el admin, y el CEO y el manager de esa organización.
-- Coach y analista no ven sueldos ni dinero.
-- ============================================================

create table if not exists admin_registros (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references orgs on delete cascade,
    tipo text not null check (tipo in ('perfil', 'miembro', 'metodo_pago', 'movimiento', 'torneo', 'relampago', 'calendario')),
    datos jsonb not null default '{}',
    creado_por uuid references profiles on delete set null,
    creado timestamptz not null default now(),
    actualizado timestamptz not null default now()
);
create index if not exists admin_registros_org on admin_registros (org_id, tipo);

create or replace function puede_administrar(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
    select mi_rol() = 'admin' or (mi_rol() in ('ceo', 'manager') and o = mi_org())
$$;

alter table admin_registros enable row level security;

drop policy if exists admin_reg_ver on admin_registros;
drop policy if exists admin_reg_crear on admin_registros;
drop policy if exists admin_reg_editar on admin_registros;
drop policy if exists admin_reg_borrar on admin_registros;

create policy admin_reg_ver on admin_registros for select using (puede_administrar(org_id));
create policy admin_reg_crear on admin_registros for insert with check (puede_administrar(org_id) and creado_por = auth.uid());
create policy admin_reg_editar on admin_registros for update using (puede_administrar(org_id)) with check (puede_administrar(org_id));
create policy admin_reg_borrar on admin_registros for delete using (puede_administrar(org_id));
