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
  /** "View live" — links to the learner-facing course in the learning MFE. */
  viewLiveLink: 'a[href*="/learning/course/"]',
  /** One app's enable/disable switch inside its settings modal, by app id. */
  enableToggle: (appId: string) => `#enable-${appId}-toggle`,
  /** The app-settings modal's "Save" — the primary action; Cancel/close is tertiary. */
  modalSaveButton: '[role="dialog"] button.btn-primary',
} as const;
