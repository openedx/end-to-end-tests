/**
 * Accessibility debt of Superset's own pages (Apache Superset 6.1.0 as Aspects
 * 5.0.0 ships it), reported on every scan of a Superset page but not failed
 * (`ASPECTS-A11Y-001`):
 *
 * - `html-has-lang` (serious): Superset's `<html>` has no `lang`;
 * - `nested-interactive` (serious): the dashboard's chart headers nest their
 *   menu triggers inside other controls.
 *
 * The Reports tab's own scan excludes the embed instead, so the Open edX surface
 * around it is held to the full gate.
 */
export const SUPERSET_A11Y_BASELINE = ['html-has-lang', 'nested-interactive'] as const;
