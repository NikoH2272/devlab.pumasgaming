-- ============================================================
-- PUMAS DEV LAB · 004 · Permisos y límites de la lectura con IA
-- ------------------------------------------------------------
-- Ejecutar en Supabase > SQL Editor (después de 003).
--
-- · Solo usan la IA el admin y los usuarios a quienes el admin
--   (o el CEO, en su organización) les active el permiso.
-- · Cada usuario tiene un límite diario (propio o el de por defecto).
-- · Hay un tope diario para toda la plataforma (cuida la cuota de Gemini).
-- · Los días se cuentan en hora de Colombia.
-- La Edge Function llama a ia_reservar() antes de usar Gemini.
-- ============================================================

alter table profiles add column if not exists ia_permitida boolean not null default false;
alter table profiles add column if not exists ia_limite_diario int check (ia_limite_diario is null or ia_limite_diario >= 0);

alter table ajustes add column if not exists ia_limite_usuario int not null default 10 check (ia_limite_usuario >= 0);
alter table ajustes add column if not exists ia_limite_global int not null default 200 check (ia_limite_global >= 0);

-- Registro de cada lectura
create table if not exists ia_uso (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references profiles on delete cascade,
    creado timestamptz not null default now(),
    ok boolean                      -- null = en curso, true = leída, false = falló (no cuenta)
);
create index if not exists ia_uso_dia on ia_uso (creado);

alter table ia_uso enable row level security;
create policy ia_uso_ver on ia_uso for select using (
    user_id = auth.uid() or mi_rol() = 'admin'
    or (mi_rol() in ('ceo', 'manager') and exists (select 1 from profiles p where p.id = user_id and p.org_id = mi_org()))
);

create or replace function hoy_co() returns date
language sql stable as $$ select (now() at time zone 'America/Bogota')::date $$;

-- Estado de la IA para el usuario actual
create or replace function ia_mi_estado() returns json
language plpgsql stable security definer set search_path = public as $$
declare
    yo profiles;
    aj ajustes;
    v_limite int;
    v_usados int;
    v_global int;
begin
    select * into yo from profiles where id = auth.uid() and activo;
    if yo is null then return json_build_object('permitida', false, 'limite', 0, 'usados', 0, 'restantes', 0); end if;
    select * into aj from ajustes where id = 1;
    v_limite := coalesce(yo.ia_limite_diario, aj.ia_limite_usuario);
    select count(*) into v_usados from ia_uso where user_id = yo.id and ok is not false and (creado at time zone 'America/Bogota')::date = hoy_co();
    select count(*) into v_global from ia_uso where ok is not false and (creado at time zone 'America/Bogota')::date = hoy_co();
    return json_build_object(
        'permitida', yo.rol = 'admin' or yo.ia_permitida,
        'limite', v_limite,
        'usados', v_usados,
        'restantes', greatest(0, least(v_limite - v_usados, aj.ia_limite_global - v_global))
    );
end $$;

-- Reserva una lectura; falla si no hay permiso o cupo. Devuelve el id del registro.
create or replace function ia_reservar() returns json
language plpgsql security definer set search_path = public as $$
declare
    yo profiles;
    aj ajustes;
    v_limite int;
    v_usados int;
    v_global int;
    v_id uuid;
begin
    select * into yo from profiles where id = auth.uid() and activo;
    if yo is null then raise exception 'IA_NO_AUTORIZADO'; end if;
    if not (yo.rol = 'admin' or yo.ia_permitida) then raise exception 'IA_SIN_PERMISO'; end if;

    -- Evita que dos lecturas simultáneas se salten el límite
    perform pg_advisory_xact_lock(hashtext('ia_uso'));

    select * into aj from ajustes where id = 1;
    v_limite := coalesce(yo.ia_limite_diario, aj.ia_limite_usuario);
    select count(*) into v_usados from ia_uso where user_id = yo.id and ok is not false and (creado at time zone 'America/Bogota')::date = hoy_co();
    if v_usados >= v_limite then raise exception 'IA_LIMITE_USUARIO:%', v_limite; end if;
    select count(*) into v_global from ia_uso where ok is not false and (creado at time zone 'America/Bogota')::date = hoy_co();
    if v_global >= aj.ia_limite_global then raise exception 'IA_LIMITE_GLOBAL'; end if;

    insert into ia_uso (user_id) values (yo.id) returning id into v_id;
    return json_build_object('id', v_id, 'restantes', greatest(0, least(v_limite - v_usados - 1, aj.ia_limite_global - v_global - 1)));
end $$;

-- Marca el resultado de una lectura (si falló, no cuenta para el límite)
create or replace function ia_finalizar(p_id uuid, p_ok boolean) returns void
language sql security definer set search_path = public as $$
    update ia_uso set ok = p_ok where id = p_id and user_id = auth.uid() and ok is null
$$;

-- Activar/desactivar el permiso y fijar el límite de un usuario
-- (admin: cualquiera · CEO: manager, coach y analista de su organización)
create or replace function ia_configurar_usuario(p_user uuid, p_permitida boolean, p_limite int) returns void
language plpgsql security definer set search_path = public as $$
declare
    objetivo profiles;
begin
    select * into objetivo from profiles where id = p_user;
    if objetivo is null then raise exception 'Usuario no encontrado.'; end if;
    -- El CEO gestiona a los demás de su organización, pero no a sí mismo
    if not (mi_rol() = 'admin' or (mi_rol() = 'ceo' and objetivo.org_id = mi_org() and objetivo.rol not in ('admin', 'ceo'))) then
        raise exception 'No permitido.';
    end if;
    if p_limite is not null and p_limite < 0 then raise exception 'El límite no puede ser negativo.'; end if;
    update profiles set ia_permitida = p_permitida, ia_limite_diario = p_limite where id = p_user;
end $$;

revoke all on function ia_mi_estado(), ia_reservar(), ia_finalizar(uuid, boolean), ia_configurar_usuario(uuid, boolean, int) from public, anon;
grant execute on function ia_mi_estado(), ia_reservar(), ia_finalizar(uuid, boolean), ia_configurar_usuario(uuid, boolean, int) to authenticated;
