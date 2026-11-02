-- MIGRACIÓN 0005: LOOP 0 - REVOCAR EXECUTE IMPLÍCITO DE PUBLIC EN FUNCIONES NUEVAS
-- En PostgreSQL, el privilegio EXECUTE para PUBLIC sobre funciones reside en el default global (defaclnamespace = 0).
-- La línea `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated`
-- de 0001_fundacion.sql no tuvo efecto porque en PostgreSQL los privilegios por defecto por esquema solo pueden agregar
-- permisos sobre los globales, nunca quitar el EXECUTE implícito de PUBLIC.
-- 0001 ya está aplicada en producción/dev y no se edita.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
