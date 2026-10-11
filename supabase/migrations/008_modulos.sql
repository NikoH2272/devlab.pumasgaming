-- ============================================================
-- PUMAS DEV LAB · 008 · Módulos activables desde Ajustes
-- ------------------------------------------------------------
-- Ejecutar en Supabase > SQL Editor (después de 007).
--
-- El admin decide en Ajustes > Módulos qué roles ven cada módulo
-- del menú. Se guarda como { "mapstream": ["admin", "ceo"], ... }.
-- Un módulo que no aparece usa el valor por defecto de js/config.js.
-- Lo leen todos los usuarios con rol (para armar su menú) y solo
-- el admin lo cambia (política ajustes_editar de schema.sql).
-- ============================================================

alter table ajustes add column if not exists modulos jsonb not null default '{}'::jsonb;
