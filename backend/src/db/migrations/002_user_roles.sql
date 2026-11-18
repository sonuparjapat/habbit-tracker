-- Numeric roles for every account in `users`:
--   1 = super admin  (all rights, manages admins)
--   2 = admin        (admin panel rights given by the permission map in src/services/roles.js)
--   3 = user         (normal app user)

CREATE TABLE roles (
  id   SMALLINT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
INSERT INTO roles (id, name) VALUES (1, 'super_admin'), (2, 'admin'), (3, 'user');

ALTER TABLE users ADD COLUMN role_id SMALLINT NOT NULL DEFAULT 3 REFERENCES roles(id);
-- Existing admins (from the old text column) become super admins
UPDATE users SET role_id = CASE role WHEN 'admin' THEN 1 ELSE 3 END;
ALTER TABLE users DROP COLUMN role;
ALTER TABLE users RENAME COLUMN role_id TO role;

CREATE INDEX users_staff_idx ON users (role) WHERE role < 3;
COMMENT ON COLUMN users.role IS '1 = super admin, 2 = admin, 3 = user (see roles table)';
