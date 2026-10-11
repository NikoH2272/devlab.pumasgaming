-- ============================================================
-- PUMAS DEV LAB · Datos de práctica para la organización de PRUEBA
-- ------------------------------------------------------------
-- Ejecutar en Supabase > SQL Editor cuando quieras datos para
-- practicar. Solo toca la organización cuyo nombre contiene
-- "prueba"; las demás organizaciones no se leen ni se modifican.
--
-- Crea 2 rosters (6 jugadores cada uno), sus caídas por mapa y
-- ~45 días de partidas con estadísticas completas.
-- Se puede ejecutar varias veces: primero borra los rosters de
-- práctica que creó antes (y con ellos sus jugadores, partidas y
-- caídas). No toca ningún otro roster de la organización.
--
-- Los rosters quedan visibles para el admin y para el CEO/manager
-- de la organización de prueba. A un coach o analista de prueba
-- asígnaselos desde Usuarios > Editar rol.
--
-- Si tu organización de prueba se llama distinto, cambia v_patron.
-- ============================================================

-- Zonas de caída por mapa (las mismas de js/db.js)
create or replace function pg_temp._zonas_practica(m mapa_ff) returns text[]
language sql immutable as $f$
    select case m
        when 'Bermuda' then array['PEAK', 'CLOCK TOWER', 'MILL', 'POCHINOK', 'KOTA TUA', 'SENTOSA', 'OBSERVATORIO', 'BIMASAKTI']
        when 'Purgatorio' then array['CENTRAL', 'FORGE', 'GOLF', 'CAMPSITE', 'SKI LODGE', 'BOMBEROS', 'QUARY', 'MOATHOUSE']
        when 'Kalahari' then array['REFINERIA', 'RUINAS', 'SANTUARIO', 'BAHIA', 'EL CONSEJO', 'LABERINTO', 'EL SUB']
        when 'Nexterra' then array['MUSEO', 'PANTANAL', 'DECAGONO', 'EOLICAS', 'PLAZARIA', 'INVERNADEROS', 'TIROLESA']
        else array['EL CENTRO', 'FERIA', 'ACUARIO', 'CASCADA', 'MOLINO', 'ARCOS', 'TORRE DE TV']
    end
$f$;

do $$
declare
    v_patron  text := '%prueba%';
    v_org     uuid;
    v_n       int;
    v_rosters text[] := array['Pumas Práctica Alpha', 'Pumas Práctica Beta'];
    v_nicks   text[] := array[
        'PG.Killua', 'PG.Zamas', 'PG.Pinocho', 'PG.Nein', 'PG.Gxrciia', 'PG.Asta',
        'PB.Raiden', 'PB.Sombra', 'PB.Toxic', 'PB.Medic', 'PB.Fenix', 'PB.Lobo'];
    v_roles   rol_jugador[] := array['rusher', 'rusher', 'granadero', 'soporte', 'rusher', 'soporte']::rol_jugador[];
    v_curva   numeric[] := array[1.7, 1.0];   -- >1 = el roster queda más arriba en la tabla
    v_mapas   mapa_ff[] := array['Bermuda', 'Purgatorio', 'Kalahari', 'Nexterra', 'Solara']::mapa_ff[];
    v_team    uuid;
    v_match   uuid;
    v_pid     uuid;
    v_jug     uuid[];
    v_juegan  int[];
    v_mapa    mapa_ff;
    v_zonas   text[];
    v_caida   text;
    v_dia     date;
    v_pos     int;
    v_ev      tipo_evento;
    v_rol     rol_jugador;
    v_k int; v_dmg int; v_vivo numeric; v_x numeric;
    r int; j int; d int; m int; q int;
begin
    select count(*) into v_n from orgs where nombre ilike v_patron;
    if v_n = 0 then raise exception 'No hay ninguna organización cuyo nombre coincida con "%".', v_patron; end if;
    if v_n > 1 then raise exception 'Hay % organizaciones que coinciden con "%": haz el patrón más exacto.', v_n, v_patron; end if;
    select id into v_org from orgs where nombre ilike v_patron;

    perform setseed(0.42);   -- los mismos datos cada vez que se ejecuta

    delete from teams where org_id = v_org and nombre = any (v_rosters);

    for r in 1..2 loop
        insert into teams (org_id, nombre) values (v_org, v_rosters[r]) returning id into v_team;

        -- Jugadores: 4 titulares + 2 suplentes; el granadero es el IGL
        v_jug := '{}';
        for j in 1..6 loop
            insert into players (team_id, nick, rol, igl, activo)
            values (v_team, v_nicks[(r - 1) * 6 + j], v_roles[j], j = 3, true)
            returning id into v_pid;
            v_jug := v_jug || v_pid;
        end loop;

        -- Caída principal y alterna por mapa
        for m in 1..5 loop
            v_zonas := pg_temp._zonas_practica(v_mapas[m]);
            insert into caidas (team_id, mapa, zona, alterna)
            values (v_team, v_mapas[m], v_zonas[1 + (r - 1) * 2], v_zonas[2 + (r - 1) * 2]);
        end loop;

        -- Partidas de los últimos 45 días
        for d in 0..44 loop
            continue when random() < 0.35;        -- días sin jugar
            v_dia := current_date - d;
            for q in 1..(2 + floor(random() * 4))::int loop
                v_mapa := v_mapas[1 + floor(random() * 5)::int];
                v_zonas := pg_temp._zonas_practica(v_mapa);
                v_caida := case when random() < 0.75 then v_zonas[1 + (r - 1) * 2]
                                else v_zonas[1 + floor(random() * array_length(v_zonas, 1))::int] end;
                v_x := random();
                v_ev := case when v_x < 0.6 then 'entreno' when v_x < 0.8 then 'torneo'
                             when v_x < 0.9 then 'relampago' else 'liga' end;
                v_pos := least(12, 1 + floor(12 * power(random(), v_curva[r]))::int);
                v_vivo := (13 - v_pos) / 12.0;     -- 1 = ganó, ~0 = cayó primero

                -- Juegan los 4 titulares, a veces entra un suplente
                v_juegan := array[1, 2, 3, 4];
                if random() < 0.25 then v_juegan[1 + floor(random() * 4)::int] := 5 + floor(random() * 2)::int; end if;

                insert into matches (team_id, fecha, hora, mapa, evento, posicion, total_equipos,
                                     primer_derribo, primera_caida, caida, notas)
                values (v_team, v_dia, make_time(13 + q * 2, floor(random() * 60)::int, 0), v_mapa, v_ev, v_pos, 12,
                        v_jug[v_juegan[1 + floor(random() * 4)::int]],
                        case when v_pos > 1 then v_jug[v_juegan[1 + floor(random() * 4)::int]] end,
                        v_caida, 'Datos de práctica')
                returning id into v_match;

                foreach j in array v_juegan loop
                    v_rol := v_roles[j];
                    v_k := floor(random() * (case v_rol when 'rusher' then 5 when 'granadero' then 4 else 2.5 end) * (0.4 + v_vivo))::int;
                    v_dmg := v_k * 190 + floor(random() * 500 * (0.5 + v_vivo))::int + case v_rol when 'granadero' then 350 else 0 end;
                    insert into match_players (match_id, player_id, k, d, a, dmg, dano_real, noqueos,
                                               curacion, levantar, resurreccion, hs)
                    values (v_match, v_jug[j], v_k,
                            case when v_pos = 1 then (random() < 0.25)::int else (random() < 0.85)::int end,
                            floor(random() * 3)::int,
                            v_dmg, floor(v_dmg * (0.55 + random() * 0.3))::int,
                            v_k + floor(random() * 2)::int,
                            floor(random() * (case v_rol when 'soporte' then 900 else 250 end))::int,
                            floor(random() * (case v_rol when 'soporte' then 4 else 1.6 end))::int,
                            floor(random() * (case v_rol when 'soporte' then 2 else 1.2 end))::int,
                            round((8 + random() * (case v_rol when 'rusher' then 40 else 25 end))::numeric, 2));
                end loop;
            end loop;
        end loop;
    end loop;

    raise notice 'Listo: % partidas de práctica en la organización de prueba.',
        (select count(*) from matches mt join teams t on t.id = mt.team_id where t.org_id = v_org and t.nombre = any (v_rosters));
end $$;
