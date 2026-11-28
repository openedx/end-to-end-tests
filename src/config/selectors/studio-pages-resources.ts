/**
 * Pages & Resources in the authoring MFE. Unlike the Settings pages, this one is
 * NOT reachable from a Studio URL (Studio does not redirect
 * `/pages-and-resources/<key>`); it is served directly on the apps origin, so the
 * page object derives the authoring-MFE base from the course outline redirect and
 * never hard-codes the mount path.
 *
 * The app grid carries no per-app hook — a card is identified only by its
 * localized title — so an app is switched through its settings **modal**, reached
 * by its own route (`…/pages-and-resources/<appId>/settings`) and keyed on the
 * toggle's stable id (`#enable-<appId>-toggle`), never through the grid card.
 */
export const STUDIO_PAGES_RESOURCES_SELECTORS = {
  /** The page container — marks the MFE route as rendered. */
  page: 'main.container-mw-md',
  /** Shown instead of the grid when the session may not view this course's apps. */
  permissionDenied: '[data-testid="permissionDeniedAlert"]',
  /**
   * "View live" — links to the learner-facing course in the learning MFE: an
   * absolute URL starting with the learning MFE's configured URL
   * (`mfeUrls.learning`), so the authoring MFE's own `/course/` links never match.
   */
  viewLiveLink: (learningUrl: string) => `a[href^="${learningUrl}/course/"]`,
  /** One app's enable/disable switch inside its settings modal, by app id. */
  enableToggle: (appId: string) => `#enable-${appId}-toggle`,
  /** The app-settings modal's "Save" — the primary action; Cancel/close is tertiary. */
  modalSaveButton: '[role="dialog"] button.btn-primary',
  /**
   * "Hide discussion tab": the switch at the top of the Discussion app's
   * provider dialog (`…/pages-and-resources/discussion`). The Discussion app
   * has no `#enable-<appId>-toggle` of its own; this is its on/off control.
   * Switching it on first asks "Hide the discussion tab?" in a confirmation
   * modal whose primary button ("Ok") saves; switching it off saves at once.
   * Measured on Tutor `main` (2026-11-24).
   */
  hideDiscussionSwitch: '[role="dialog"] [data-testid="hide-discussion"]',
  hideDiscussionConfirmButton: '.hide-discussion-modal .pgn__modal-footer button.btn-primary',
  /**
   * "Flex Peer Grading": the one switch of the ORA settings modal ("Configure
   * Flexible Peer Grading", `…/pages-and-resources/ora_settings/settings`),
   * which the course offers once it holds an open response assessment. Saved
   * with the modal's `modalSaveButton`. Measured on Tutor `main` (2026-11-24).
   */
  flexiblePeerGradingSwitch: '[role="dialog"] #enable-flexible-peer-grade',
} as const;
