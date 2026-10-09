-- ============================================================
-- PUMAS DEV LAB · Esquema Supabase con roles y RLS
-- ------------------------------------------------------------
-- Ejecutar UNA VEZ en Supabase > SQL Editor sobre un proyecto nuevo.
-- La seguridad la impone la base de datos (Row Level Security):
-- aunque alguien manipule la página, solo ve y edita lo que su rol permite.
--
-- DESPUÉS ejecuta supabase/migrations/002_usuarios_sin_correo.sql:
-- las cuentas se crean con USUARIO y contraseña directamente en la
-- base de datos (sin correos), validando la jerarquía de roles.
-- ============================================================

create type rol_staff as enum ('admin', 'ceo', 'manager', 'coach', 'analista');
create type rol_jugador as enum ('rusher', 'granadero', 'soporte');
create type tipo_evento as enum ('entreno', 'torneo', 'relampago', 'liga');
create type mapa_ff as enum ('Bermuda', 'Purgatorio', 'Kalahari', 'Nexterra', 'Solara');

-- Organización = equipo general (ej. Pumas Gaming)
create table orgs (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    logo text,                       -- data URL comprimida (256px)
    creado timestamptz not null default now()
);

-- Perfil de cada usuario de Supabase Auth
create table profiles (
    id uuid primary key references auth.users on delete cascade,
    nombre text not null,
    usuario text not null unique check (usuario ~ '^[a-z0-9._-]{3,30}$'),
    email text not null,
    rol rol_staff not null,
    org_id uuid references orgs on delete set null,
    creado_por uuid references profiles on delete set null,
    activo boolean not null default true,
    creado timestamptz not null default now()
);

-- Roster dentro de una organización
create table teams (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references orgs on delete cascade,
    nombre text not null,
    logo text,
    creado_por uuid references profiles on delete set null,
    creado timestamptz not null default now()
);

-- Asignación de coach/analista a rosters
create table team_staff (
    team_id uuid references teams on delete cascade,
    user_id uuid references profiles on delete cascade,
    primary key (team_id, user_id)
);

create table players (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references teams on delete cascade,
    nick text not null,
    nombre text,
    rol rol_jugador not null,
    igl boolean not null default false,
    activo boolean not null default true,
    creado timestamptz not null default now()
);
-- Un solo IGL por roster
create unique index un_igl_por_roster on players (team_id) where igl;

create table matches (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references teams on delete cascade,
    fecha date not null,
    hora time not null,
    mapa mapa_ff not null,
    evento tipo_evento not null,
    posicion int not null check (posicion >= 1),
    total_equipos int not null default 12 check (total_equipos >= posicion),
    primer_derribo uuid references players on delete set null,
    primera_caida uuid references players on delete set null,
    notas text,
    captura text,                    -- data URL comprimida de la captura
    tiene_captura boolean generated always as (captura is not null) stored,
    creado_por uuid references profiles on delete set null,
    creado timestamptz not null default now()
);
create index matches_team_fecha on matches (team_id, fecha);

-- Una fila por jugador por partida (datos del marcador del juego)
create table match_players (
    match_id uuid references matches on delete cascade,
    player_id uuid references players on delete cascade,
    k int not null default 0, d int not null default 0, a int not null default 0,
    dmg int not null default 0,
    dano_real int not null default 0,
    noqueos int not null default 0,
    curacion int not null default 0,
    levantar int not null default 0,
    resurreccion int not null default 0,
    hs numeric(6,2) not null default 0,
    primary key (match_id, player_id)
);

-- Ajustes generales de la plataforma (una sola fila, la edita el admin)
create table ajustes (
    id int primary key default 1 check (id = 1),
    soporte_url text,        -- ej. https://wa.me/573001234567
    whatsapp_canal_url text, -- ej. https://whatsapp.com/channel/...
    actualizado timestamptz not null default now()
);
insert into ajustes (id) values (1);

-- ------------------------------------------------------------
-- Funciones auxiliares (security definer para evitar recursión RLS)
-- ------------------------------------------------------------
create or replace function mi_rol() returns rol_staff
language sql stable security definer set search_path = public as $$
    select rol from profiles where id = auth.uid() and activo
$$;

create or replace function mi_org() returns uuid
language sql stable security definer set search_path = public as $$
    select org_id from profiles where id = auth.uid() and activo
$$;

create or replace function nivel_rol(r rol_staff) returns int
language sql immutable as $$
    select case r when 'admin' then 5 when 'ceo' then 4 when 'manager' then 3 when 'coach' then 2 else 1 end
$$;

-- ¿Puede el usuario actual ver este roster?
create or replace function puede_ver_team(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
    select case
        when mi_rol() = 'admin' then true
        when mi_rol() in ('ceo', 'manager') then exists (select 1 from teams where id = t and org_id = mi_org())
        when mi_rol() in ('coach', 'analista') then exists (select 1 from team_staff where team_id = t and user_id = auth.uid())
        else false
    end
$$;

-- ¿Puede editar jugadores / registrar partidas en este roster?
create or replace function puede_editar_team(t uuid, incluir_analista boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
    select puede_ver_team(t) and (
        mi_rol() in ('admin', 'ceo', 'coach') or (incluir_analista and mi_rol() = 'analista')
    )
$$;

-- ------------------------------------------------------------
-- RPC: gestión de usuarios
-- ------------------------------------------------------------
-- Para la pantalla de configuración inicial (accesible sin sesión)
create or replace function hay_usuarios() returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from profiles)
$$;

-- Convierte la cuenta actual en administrador si aún no hay ninguno
create or replace function crear_primer_admin(p_nombre text, p_usuario text) returns void
language plpgsql security definer set search_path = public as $$
begin
    if auth.uid() is null then raise exception 'Sin sesión'; end if;
    lock table profiles in exclusive mode;
    if exists (select 1 from profiles) then raise exception 'Ya existe un administrador'; end if;
    insert into profiles (id, nombre, usuario, email, rol)
    select auth.uid(), p_nombre, lower(p_usuario), email, 'admin' from auth.users where id = auth.uid();
end $$;

-- Asigna rol, organización y rosters a una cuenta recién creada
create or replace function registrar_perfil(
    p_user uuid, p_nombre text, p_usuario text, p_rol rol_staff, p_org uuid, p_equipos uuid[] default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
    yo rol_staff := mi_rol();
    v_email text;
begin
    if yo is null or yo not in ('admin', 'ceo', 'coach') then raise exception 'No puedes crear usuarios'; end if;
    if not (yo = 'admin' or nivel_rol(p_rol) < nivel_rol(yo)) then raise exception 'No puedes crear ese rol'; end if;
    if yo <> 'admin' and p_org is distinct from mi_org() then raise exception 'Solo puedes crear usuarios en tu organización'; end if;
    if p_rol <> 'admin' and p_org is null then raise exception 'Falta la organización'; end if;
    if exists (select 1 from profiles where id = p_user) then raise exception 'Esa cuenta ya tiene perfil'; end if;

    select email into v_email from auth.users where id = p_user;
    if v_email is null then raise exception 'Cuenta no encontrada'; end if;

    insert into profiles (id, nombre, usuario, email, rol, org_id, creado_por)
    values (p_user, p_nombre, lower(p_usuario), v_email, p_rol, case when p_rol = 'admin' then null else p_org end, auth.uid());

    -- Solo se asignan rosters que el creador puede editar y que pertenecen a esa organización
    insert into team_staff (team_id, user_id)
    select t.id, p_user from teams t
    where t.id = any (p_equipos) and t.org_id = p_org and puede_editar_team(t.id);
end $$;

-- Activar / desactivar un usuario de rango inferior
create or replace function set_usuario_activo(p_user uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
    objetivo profiles;
begin
    select * into objetivo from profiles where id = p_user;
    if objetivo is null or p_user = auth.uid() then raise exception 'No permitido'; end if;
    if not (mi_rol() = 'admin'
        or (mi_rol() in ('ceo', 'coach') and nivel_rol(objetivo.rol) < nivel_rol(mi_rol()) and objetivo.org_id = mi_org())) then
        raise exception 'No permitido';
    end if;
    update profiles set activo = p_activo where id = p_user;
end $$;

-- Marca un IGL (desmarca al anterior del mismo roster)
create or replace function marcar_igl(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
    t uuid;
begin
    select team_id into t from players where id = p_player;
    if t is null or not puede_editar_team(t) then raise exception 'No permitido'; end if;
    update players set igl = false where team_id = t and igl;
    update players set igl = true where id = p_player;
end $$;

revoke execute on function crear_primer_admin, registrar_perfil, set_usuario_activo, marcar_igl from anon;
grant execute on function hay_usuarios to anon, authenticated;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table orgs enable row level security;
alter table profiles enable row level security;
alter table teams enable row level security;
alter table team_staff enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table ajustes enable row level security;

-- Ajustes: los ve cualquier usuario con rol; solo el admin los cambia
create policy ajustes_ver on ajustes for select using (mi_rol() is not null);
create policy ajustes_editar on ajustes for update using (mi_rol() = 'admin') with check (mi_rol() = 'admin');

-- Organizaciones
create policy orgs_ver on orgs for select using (mi_rol() = 'admin' or id = mi_org());
create policy orgs_crear on orgs for insert with check (mi_rol() = 'admin');
create policy orgs_editar on orgs for update using (mi_rol() = 'admin' or (mi_rol() = 'ceo' and id = mi_org()));

-- Perfiles: solo lectura; los cambios van por las funciones RPC
create policy profiles_ver on profiles for select using (
    id = auth.uid() or mi_rol() = 'admin'
    or (mi_rol() in ('ceo', 'manager') and org_id = mi_org())
    or (mi_rol() = 'coach' and creado_por = auth.uid())
);

-- Rosters
create policy teams_ver on teams for select using (puede_ver_team(id) or creado_por = auth.uid());
create policy teams_crear on teams for insert with check (
    creado_por = auth.uid() and (mi_rol() = 'admin' or (mi_rol() in ('ceo', 'coach') and org_id = mi_org()))
);
create policy teams_editar on teams for update using (puede_editar_team(id));
create policy teams_borrar on teams for delete using (
    mi_rol() = 'admin' or (mi_rol() = 'ceo' and org_id = mi_org())
);

create policy staff_ver on team_staff for select using (puede_ver_team(team_id));

-- Jugadores
create policy players_ver on players for select using (puede_ver_team(team_id));
create policy players_crear on players for insert with check (puede_editar_team(team_id) and not igl);
create policy players_editar on players for update using (puede_editar_team(team_id)) with check (puede_editar_team(team_id));

-- Partidas
create policy matches_ver on matches for select using (puede_ver_team(team_id));
create policy matches_crear on matches for insert with check (puede_editar_team(team_id, true) and creado_por = auth.uid());
create policy matches_borrar on matches for delete using (puede_editar_team(team_id));

create policy mp_ver on match_players for select using (
    exists (select 1 from matches m where m.id = match_id and puede_ver_team(m.team_id))
);
create policy mp_crear on match_players for insert with check (
    exists (select 1 from matches m where m.id = match_id and puede_editar_team(m.team_id, true))
);

-- Al crear un roster, quien lo crea queda asignado
create or replace function asignar_creador() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.creado_por is not null then
        insert into team_staff (team_id, user_id) values (new.id, new.creado_por) on conflict do nothing;
    end if;
    return new;
end $$;
create trigger trg_asignar_creador after insert on teams for each row execute function asignar_creador();
