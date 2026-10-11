-- ============================================================
-- PUMAS DEV LAB · 007 · Organizaciones separadas en todo momento
-- ------------------------------------------------------------
-- Ejecutar en Supabase > SQL Editor (después de 006).
--
-- Cierra los huecos por donde un dato de una organización podía
-- quedar ligado o visible desde otra:
-- · Un coach/analista solo ve rosters de SU organización (aunque
--   le quede una asignación vieja o haya creado el roster antes).
-- · Un roster no se puede mover de organización (salvo el admin).
-- · Las estadísticas, el primer derribo/caída y los planos solo
--   pueden apuntar a jugadores/rosters de la misma organización.
-- · El coach deja de ver usuarios que creó si cambian de organización.
-- ============================================================

-- ---------- Visibilidad de rosters ----------
create or replace function puede_ver_team(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
    select case
        when mi_rol() = 'admin' then true
        when mi_rol() in ('ceo', 'manager') then exists (select 1 from teams where id = t and org_id = mi_org())
        when mi_rol() in ('coach', 'analista') then exists (
            select 1 from team_staff s join teams tm on tm.id = s.team_id
            where s.team_id = t and s.user_id = auth.uid() and tm.org_id = mi_org())
        else false
    end
$$;

drop policy if exists teams_ver on teams;
create policy teams_ver on teams for select using (
    puede_ver_team(id) or (creado_por = auth.uid() and org_id = mi_org())
);

drop policy if exists profiles_ver on profiles;
create policy profiles_ver on profiles for select using (
    id = auth.uid() or mi_rol() = 'admin'
    or (mi_rol() in ('ceo', 'manager') and org_id = mi_org())
    or (mi_rol() = 'coach' and creado_por = auth.uid() and org_id = mi_org())
);

-- ---------- Un roster no cambia de organización ----------
create or replace function _roster_fijo_en_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.org_id is distinct from old.org_id and mi_rol() is distinct from 'admin' then
        raise exception 'Un roster no puede pasar a otra organización.';
    end if;
    -- Si el admin lo mueve, se quitan asignaciones de staff de la otra organización
    if new.org_id is distinct from old.org_id then
        delete from team_staff s using profiles p
        where s.team_id = new.id and p.id = s.user_id and p.org_id is distinct from new.org_id;
    end if;
    return new;
end $$;
drop trigger if exists trg_roster_fijo on teams;
create trigger trg_roster_fijo before update of org_id on teams
    for each row execute function _roster_fijo_en_org();

-- ---------- Staff asignado solo a rosters de su organización ----------
create or replace function _staff_misma_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if not exists (
        select 1 from teams t join profiles p on p.id = new.user_id
        where t.id = new.team_id and (p.rol = 'admin' or p.org_id = t.org_id)
    ) then
        raise exception 'Ese usuario es de otra organización.';
    end if;
    return new;
end $$;
drop trigger if exists trg_staff_misma_org on team_staff;
create trigger trg_staff_misma_org before insert or update on team_staff
    for each row execute function _staff_misma_org();

-- ---------- Estadísticas: el jugador debe ser del roster de la partida ----------
create or replace function _stats_mismo_roster() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if not exists (
        select 1 from matches m join players p on p.team_id = m.team_id
        where m.id = new.match_id and p.id = new.player_id
    ) then
        raise exception 'El jugador no pertenece al roster de esa partida.';
    end if;
    return new;
end $$;
drop trigger if exists trg_stats_mismo_roster on match_players;
create trigger trg_stats_mismo_roster before insert or update on match_players
    for each row execute function _stats_mismo_roster();

create or replace function _partida_jugadores_del_roster() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.primer_derribo is not null and not exists (select 1 from players where id = new.primer_derribo and team_id = new.team_id)
        or new.primera_caida is not null and not exists (select 1 from players where id = new.primera_caida and team_id = new.team_id) then
        raise exception 'El primer derribo / primera caída debe ser un jugador del roster.';
    end if;
    return new;
end $$;
drop trigger if exists trg_partida_jugadores on matches;
create trigger trg_partida_jugadores before insert or update on matches
    for each row execute function _partida_jugadores_del_roster();

-- ---------- Planos: el roster debe ser de la misma organización ----------
create or replace function _tablero_misma_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.team_id is not null and not exists (select 1 from teams where id = new.team_id and org_id = new.org_id) then
        raise exception 'El roster del plano es de otra organización.';
    end if;
    return new;
end $$;
drop trigger if exists trg_tablero_misma_org on tableros;
create trigger trg_tablero_misma_org before insert or update on tableros
    for each row execute function _tablero_misma_org();

-- Un plano no cambia de organización
drop policy if exists tableros_editar on tableros;
create policy tableros_editar on tableros for update using (
    creado_por = auth.uid() or mi_rol() = 'admin' or (mi_rol() = 'ceo' and org_id = mi_org())
) with check (mi_rol() = 'admin' or org_id = mi_org());
