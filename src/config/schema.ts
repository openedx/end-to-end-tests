import { z } from 'zod';

/**
 * Coerces common truthy/falsy string spellings into a boolean. Applied to env
 * values that represent flags.
 */
const booleanFromEnv = z
  .preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.enum(['true', 'false', '1', '0', 'yes', 'no']),
  )
  .transform((value) => value === 'true' || value === '1' || value === 'yes');

/**
 * Shape and presence of the raw environment. URL, cross-origin, and capability
 * validation that spans multiple variables happens in `load.ts`; here we only
 * assert that required variables are present and individual values are
 * well-formed.
 *
 * Wrapped in a preprocess that trims every string and treats a blank value as
 * absent, so an empty `FOO=` in a `.env` file fails the same "required" check as
 * omitting it entirely — a common footgun.
 */
export const rawEnvSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'object' || value === null) {
      return value;
    }
    const cleaned: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed !== '') {
          cleaned[key] = trimmed;
        }
      } else if (raw !== undefined) {
        cleaned[key] = raw;
      }
    }
    return cleaned;
  },
  z.object({
    // Base URLs.
    LMS_BASE_URL: z.string(),
    APPS_BASE_URL: z.string(),
    CMS_BASE_URL: z.string().optional(),

    // Credentials (paired admin/staff account; validated together in load.ts).
    ADMIN_USERNAME: z.string().optional(),
    ADMIN_PASSWORD: z.string().optional(),

    // Tenant / content identifiers.
    ORG: z.string().optional(),
    COURSE_KEY: z.string().optional(),

    // Capability declaration (comma-separated list of capability tags).
    CAPABILITIES: z.string().optional(),

    // Account-creation / activation backend (see src/config/account-backends.ts).
    ACCOUNT_BACKEND: z.string().optional(),

    // Escape hatch for providers whose origins are not same-site.
    ALLOW_CROSS_SITE_ORIGINS: booleanFromEnv.optional(),
  }),
);

export type RawEnv = z.infer<typeof rawEnvSchema>;
