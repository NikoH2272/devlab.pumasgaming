-- ============================================================
-- PUMAS DEV LAB · 005 · Cambiar rol, organización y rosters
-- ------------------------------------------------------------
-- Ejecutar en Supabase > SQL Editor (después de 004).
--
-- · Admin: cambia a cualquiera (rol, organización y rosters).
-- · CEO: cambia a manager, coach y analista de su organización,
--        y solo puede asignarles esos mismos roles.
-- · Nadie se cambia el rol a sí mismo.
-- · Siempre debe quedar al menos un admin activo.
-- ============================================================

create or replace function cambiar_rol(
    p_user uuid, p_rol rol_staff, p_org uuid default null, p_equipos uuid[] default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
    yo rol_staff := mi_rol();
    objetivo profiles;
    v_org uuid;
begin
    select * into objetivo from profiles where id = p_user;
    if objetivo is null then raise exception 'Usuario no encontrado.'; end if;
    if p_user = auth.uid() then raise exception 'No puedes cambiar tu propio rol.'; end if;

    if yo = 'admin' then
        v_org := case when p_rol = 'admin' then null else coalesce(p_org, objetivo.org_id) end;
    elsif yo = 'ceo' then
        if objetivo.org_id is distinct from mi_org()
            or nivel_rol(objetivo.rol) >= nivel_rol('ceo')
            or nivel_rol(p_rol) >= nivel_rol('ceo') then
            raise exception 'Solo puedes cambiar managers, coaches y analistas de tu organización a esos mismos roles.';
        end if;
        v_org := mi_org();
    else
        raise exception 'No puedes cambiar roles.';
    end if;

    if p_rol <> 'admin' and v_org is null then raise exception 'Elige una organización para este rol.'; end if;

    -- No dejar la plataforma sin administradores
    if objetivo.rol = 'admin' and p_rol <> 'admin'
        and not exists (select 1 from profiles where rol = 'admin' and activo and id <> p_user) then
        raise exception 'Debe quedar al menos un administrador.';
    end if;

    update profiles set rol = p_rol, org_id = v_org where id = p_user;

    -- Rosters asignados: solo aplican a coach y analista
    delete from team_staff where user_id = p_user;
    if p_rol in ('coach', 'analista') then
        insert into team_staff (team_id, user_id)
        select t.id, p_user from teams t
        where t.id = any (p_equipos) and t.org_id = v_org and puede_editar_team(t.id);
    end if;
end $$;

revoke all on function cambiar_rol(uuid, rol_staff, uuid, uuid[]) from public, anon;
grant execute on function cambiar_rol(uuid, rol_staff, uuid, uuid[]) to authenticated;
