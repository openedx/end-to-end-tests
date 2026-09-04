/**
 * Named roles the auth contract can produce a signed-in session for. Specs ask
 * for a role rather than juggling credentials, so a provider with custom
 * provisioning can satisfy the same roles without the tests changing.
 */
export const ROLES = ['learner', 'instructor', 'staff'] as const;

export type Role = (typeof ROLES)[number];
