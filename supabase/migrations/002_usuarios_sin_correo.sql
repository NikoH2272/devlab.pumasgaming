-- ============================================================
-- PUMAS DEV LAB · 002 · Cuentas con usuario y contraseña
-- ------------------------------------------------------------
-- Ejecutar en Supabase > SQL Editor (después de schema.sql).
--
-- Las cuentas se crean directamente en la base de datos: no se
-- usa el registro por correo de Supabase, no se envía ningún
-- correo y no depende de "Confirm email". Internamente Supabase
-- Auth guarda un identificador usuario@usuarios.pumasgaming.com,
-- pero nadie lo ve ni lo escribe: en la página solo existe el usuario.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- Ya no se usan (las cuentas no se registran desde el navegador)
drop function if exists crear_primer_admin(text, text);
drop function if exists registrar_perfil(uuid, text, text, rol_staff, uuid, uuid[]);

-- ------------------------------------------------------------
-- Interna: crea la cuenta en auth.users con contraseña cifrada
-- ------------------------------------------------------------
create or replace function _crear_cuenta(p_usuario text, p_password text) returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
    v_id uuid := gen_random_uuid();
    v_email text := lower(p_usuario) || '@usuarios.pumasgaming.com';
begin
    if lower(p_usuario) !~ '^[a-z0-9._-]{3,30}$' then
        raise exception 'El usuario debe tener 3 a 30 caracteres: letras, números, punto, guion o guion bajo, sin espacios.';
    end if;
    if length(coalesce(p_password, '')) < 8 then
        raise exception 'La contraseña debe tener al menos 8 caracteres.';
    end if;
    if exists (select 1 from auth.users where email = v_email) or exists (select 1 from public.profiles where usuario = lower(p_usuario)) then
        raise exception 'Ese nombre de usuario ya existe.';
    end if;

    insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, reauthentication_token
    ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
        crypt(p_password, gen_salt('bf')), now(),
        '{"provider": "email", "providers": ["email"]}', jsonb_build_object('usuario', lower(p_usuario)), now(), now(),
        '', '', '', '', '', ''
    );

    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id::text, v_id,
            jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
            'email', now(), now(), now());

    return v_id;
end $$;

-- ------------------------------------------------------------
-- Primer administrador (solo funciona mientras no haya ningún perfil)
-- ------------------------------------------------------------
create or replace function crear_primer_admin(p_nombre text, p_usuario text, p_password text) returns void
language plpgsql security definer set search_path = public as $$
declare
    v_id uuid;
begin
    lock table profiles in exclusive mode;
    if exists (select 1 from profiles) then raise exception 'Ya existe un administrador.'; end if;
    v_id := _crear_cuenta(p_usuario, p_password);
    insert into profiles (id, nombre, usuario, email, rol)
    values (v_id, p_nombre, lower(p_usuario), lower(p_usuario) || '@usuarios.pumasgaming.com', 'admin');
end $$;

-- ------------------------------------------------------------
-- Crear usuario (admin, CEO o coach; siempre un rol inferior al propio)
-- ------------------------------------------------------------
create or replace function crear_usuario(
    p_nombre text, p_usuario text, p_password text, p_rol rol_staff, p_org uuid, p_equipos uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
    yo rol_staff := mi_rol();
    v_id uuid;
begin
    if yo is null or yo not in ('admin', 'ceo', 'coach') then raise exception 'No puedes crear usuarios.'; end if;
    if not (yo = 'admin' or nivel_rol(p_rol) < nivel_rol(yo)) then raise exception 'No puedes crear ese rol.'; end if;
    if yo <> 'admin' and p_org is distinct from mi_org() then raise exception 'Solo puedes crear usuarios en tu organización.'; end if;
    if p_rol <> 'admin' and p_org is null then raise exception 'Falta la organización.'; end if;

    v_id := _crear_cuenta(p_usuario, p_password);
    insert into profiles (id, nombre, usuario, email, rol, org_id, creado_por)
    values (v_id, p_nombre, lower(p_usuario), lower(p_usuario) || '@usuarios.pumasgaming.com',
            p_rol, case when p_rol = 'admin' then null else p_org end, auth.uid());

    -- Solo rosters que el creador puede editar y que son de esa organización
    insert into team_staff (team_id, user_id)
    select t.id, v_id from teams t
    where t.id = any (p_equipos) and t.org_id = p_org and puede_editar_team(t.id);

    return v_id;
end $$;

-- ------------------------------------------------------------
-- Cambiar contraseña: la propia, o la de alguien de rango inferior
-- ------------------------------------------------------------
create or replace function cambiar_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
    objetivo profiles;
begin
    select * into objetivo from profiles where id = p_user;
    if objetivo is null then raise exception 'Usuario no encontrado.'; end if;
    if not (p_user = auth.uid() or mi_rol() = 'admin'
        or (mi_rol() in ('ceo', 'coach') and nivel_rol(objetivo.rol) < nivel_rol(mi_rol()) and objetivo.org_id = mi_org())) then
        raise exception 'No permitido.';
    end if;
    if length(coalesce(p_password, '')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres.'; end if;
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
end $$;

-- Permisos de ejecución
revoke all on function _crear_cuenta(text, text) from public, anon, authenticated;
revoke all on function crear_primer_admin(text, text, text) from public;
revoke all on function crear_usuario(text, text, text, rol_staff, uuid, uuid[]) from public, anon;
revoke all on function cambiar_password(uuid, text) from public, anon;
grant execute on function crear_primer_admin(text, text, text) to anon, authenticated;
grant execute on function crear_usuario(text, text, text, rol_staff, uuid, uuid[]) to authenticated;
grant execute on function cambiar_password(uuid, text) to authenticated;
