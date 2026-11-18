/** Mirrors backend/src/services/roles.js. The backend always re-checks every permission. */

export const ROLES = Object.freeze({ SUPER_ADMIN: 1, ADMIN: 2, USER: 3 });

export const ROLE_BADGE = {
  1: { label: 'Super admin', className: 'badge amber' },
  2: { label: 'Admin', className: 'badge violet' },
  3: null,
};

export const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: 'dashboard.view',
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  USERS_DELETE: 'users.delete',
  ADMINS_MANAGE: 'admins.manage',
  TEMPLATES_MANAGE: 'templates.manage',
  AUDIT_VIEW: 'audit.view',
  CONTENT_MANAGE: 'content.manage',
  FEEDBACK_MANAGE: 'feedback.manage',
  SETTINGS_MANAGE: 'settings.manage',
  SYSTEM_VIEW: 'system.view',
});

/** `me` is the signed-in user from GET /auth/me (it carries its own permissions list). */
export const can = (me, permission) => Boolean(me?.permissions?.includes(permission));
