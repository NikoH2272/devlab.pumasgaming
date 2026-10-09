-- ============================================================
-- PUMAS DEV LAB · 006 · Módulo Estrategia (mapas, vistas aéreas, repisa)
-- ------------------------------------------------------------
-- Ejecutar en Supabase > SQL Editor (después de 005).
--
-- · tableros: cada plan de mapa o vista aérea guardado en la Repisa.
--   Lo ve toda la organización; lo edita quien lo creó, el admin y el CEO.
-- · mapas_imagenes: la imagen de fondo de cada mapa por organización.
--   La cambian admin, CEO y coach.
-- ============================================================

create table tableros (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references orgs on delete cascade,
    team_id uuid references teams on delete set null,
    tipo text not null check (tipo in ('mapa', 'aerea')),
    nombre text not null,
    mapa mapa_ff,
    fondo text,            -- imagen de la vista aérea (data URL comprimida)
    miniatura text,        -- vista previa pequeña para la Repisa
    datos jsonb not null default '{}',
    creado_por uuid references profiles on delete set null,
    creado timestamptz not null default now(),
    actualizado timestamptz not null default now()
);
create index tableros_org on tableros (org_id, actualizado desc);

create table mapas_imagenes (
    org_id uuid references orgs on delete cascade,
    mapa mapa_ff,
    imagen text not null,
    actualizado timestamptz not null default now(),
    primary key (org_id, mapa)
);

alter table tableros enable row level security;
alter table mapas_imagenes enable row level security;

create policy tableros_ver on tableros for select using (mi_rol() = 'admin' or org_id = mi_org());
create policy tableros_crear on tableros for insert with check (
    creado_por = auth.uid() and (mi_rol() = 'admin' or org_id = mi_org())
);
create policy tableros_editar on tableros for update using (
    creado_por = auth.uid() or mi_rol() = 'admin' or (mi_rol() = 'ceo' and org_id = mi_org())
);
create policy tableros_borrar on tableros for delete using (
    creado_por = auth.uid() or mi_rol() = 'admin' or (mi_rol() = 'ceo' and org_id = mi_org())
);

create policy mapas_img_ver on mapas_imagenes for select using (mi_rol() = 'admin' or org_id = mi_org());
create policy mapas_img_crear on mapas_imagenes for insert with check (
    mi_rol() = 'admin' or (mi_rol() in ('ceo', 'coach') and org_id = mi_org())
);
create policy mapas_img_editar on mapas_imagenes for update using (
    mi_rol() = 'admin' or (mi_rol() in ('ceo', 'coach') and org_id = mi_org())
);
