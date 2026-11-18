-- Rename the account tables:
--   users -> members
--   roles -> member_roles
-- Data, foreign keys (every *.user_id column) and ON DELETE CASCADE rules carry over automatically.
-- Column names (user_id, role, ...) are unchanged.

ALTER TABLE users RENAME TO members;
ALTER TABLE roles RENAME TO member_roles;

-- Rename the generated constraint and index names too (users_email_key -> members_email_key, ...),
-- looked up from the catalog so this works whatever names Postgres generated.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conrelid::regclass::text AS tbl, conname,
           CASE WHEN conrelid = 'members'::regclass THEN regexp_replace(conname, '^users_', 'members_')
                ELSE regexp_replace(conname, '^roles_', 'member_roles_') END AS newname
      FROM pg_constraint
     WHERE (conrelid = 'members'::regclass AND conname LIKE 'users\_%')
        OR (conrelid = 'member_roles'::regclass AND conname LIKE 'roles\_%')
  LOOP
    EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', r.tbl, r.conname, r.newname);
  END LOOP;

  -- Remaining plain indexes (constraint-backed ones were renamed with their constraint)
  FOR r IN
    SELECT c.relname AS idx,
           CASE WHEN i.indrelid = 'members'::regclass THEN regexp_replace(c.relname, '^users_', 'members_')
                ELSE regexp_replace(c.relname, '^roles_', 'member_roles_') END AS newname
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
     WHERE (i.indrelid = 'members'::regclass AND c.relname LIKE 'users\_%')
        OR (i.indrelid = 'member_roles'::regclass AND c.relname LIKE 'roles\_%')
  LOOP
    EXECUTE format('ALTER INDEX %I RENAME TO %I', r.idx, r.newname);
  END LOOP;
END $$;

COMMENT ON TABLE members IS 'Every account: super admins (role 1), admins (2) and users (3)';
COMMENT ON TABLE member_roles IS 'Lookup for members.role: 1 super_admin, 2 admin, 3 user';
COMMENT ON COLUMN members.role IS '1 = super admin, 2 = admin, 3 = user (see member_roles)';
