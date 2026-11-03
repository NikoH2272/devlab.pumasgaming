-- Permite actualizar únicamente la fecha y hora de una partida existente.
-- Los permisos se validan dentro de la función para evitar abrir UPDATE directo.
create or replace function actualizar_fecha_hora_partida(p_match uuid, p_fecha date, p_hora time) returns void
language plpgsql security definer set search_path = public as $$
begin
    update matches set fecha = p_fecha, hora = p_hora
    where id = p_match and puede_editar_team(team_id);
    if not found then raise exception 'No tienes permiso para editar esa partida o no existe.'; end if;
end $$;

notify pgrst, 'reload schema';
