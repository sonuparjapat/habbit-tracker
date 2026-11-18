/**
 * Roles and permissions.
 *
 * Every account is a row in `members`; `members.role` decides what it can do (lookup table: `member_roles`).
 * To change what admins may do, edit PERMISSIONS below. No database change is needed.
 */

export const ROLES = Object.freeze({ SUPER_ADMIN: 1, ADMIN: 2, USER: 3 });

export const ROLE_NAMES = Object.freeze({ 1: 'super_admin', 2: 'admin', 3: 'user' });
export const ROLE_LABELS = Object.freeze({ 1: 'Super admin', 2: 'Admin', 3: 'User' });

/** Everything the admin panel can do. */
export const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: 'dashboard.view',
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage', // suspend / reactivate / verify / sign out a normal user
  USERS_DELETE: 'users.delete',
  ADMINS_MANAGE: 'admins.manage', // promote / demote admins, act on admin accounts
  TEMPLATES_MANAGE: 'templates.manage',
  AUDIT_VIEW: 'audit.view',
  CONTENT_MANAGE: 'content.manage', // announcements
  FEEDBACK_MANAGE: 'feedback.manage',
  SETTINGS_MANAGE: 'settings.manage', // app-wide settings (support email, maintenance, versions, XP...)
  SYSTEM_VIEW: 'system.view', // health, test email
});

const ALL = Object.values(PERMISSIONS);

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: ALL,
  [ROLES.ADMIN]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.TEMPLATES_MANAGE,
    PERMISSIONS.CONTENT_MANAGE,
    PERMISSIONS.FEEDBACK_MANAGE,
  ],
  [ROLES.USER]: [],
});

export const isAdminRole = (role) => role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;
export const permissionsFor = (role) => ROLE_PERMISSIONS[role] ?? [];
export const can = (role, permission) => permissionsFor(role).includes(permission);
