/**
 * Raised when the environment cannot produce a valid configuration.
 *
 * Configuration is validated at load time so a misconfigured run fails fast with
 * a clear, actionable message rather than producing a misleading test failure
 * (ADR-0002, "Configurable and deployment-agnostic").
 */
export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    const list = issues.map((issue) => `  - ${issue}`).join('\n');
    super(
      `Invalid end-to-end test configuration:\n${list}\n\n` +
        'Check .env and set the required variables. Every variable ' +
        'is documented in .env.example for reference.',
    );
    this.name = 'ConfigError';
    this.issues = issues;
  }
}
