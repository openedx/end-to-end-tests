/**
 * The notifications tray (`frontend-app-notifications`) and the notification
 * preference centre (the account MFE's `#notifications` section).
 *
 * The tray is a header component, not an MFE: it renders in the header of the
 * learner dashboard, account, learning, discussions and authoring MFEs. It has
 * the same test ids in both header generations — the `frontend-component-header`
 * 8.2 tray (verawood) and the frontend-base app (main) — so these anchors are
 * not a union. Measured on local `main` 2026-09-23; confirmed on `verawood` by
 * dispatch.
 *
 * Each anchor names the localized string it stands in for, per
 * `src/config/selectors/README.md`.
 */
export const NOTIFICATION_TRAY_SELECTORS = {
  /**
   * The bell's wrapper — the click target. The unseen badge sits on top of the
   * bell button and intercepts its clicks, so a user clicks the wrapper (bell or
   * badge). `:visible` because the frontend-base shell renders the header twice
   * on some pages (`BASE-002`), one copy hidden.
   */
  bell: '#notificationIcon:visible',

  /** The unseen-count badge on the bell ("3", "99+"). Absent at zero. */
  bellBadge: '[data-testid="notification-count"]',

  /** The open tray popover — "Notifications". */
  tray: '[data-testid="notification-tray"]',

  /**
   * The gear in the tray header — "preferences settings icon". The link around
   * it (`target="_blank"`) goes to the account MFE's `#notifications` section.
   */
  gearLink: 'a:has([data-testid="setting-icon"])',

  /** One app tab ("Discussion", "Updates", "Grading"), keyed by its app name. */
  tab: (app: string) => `[role="tab"][data-rb-event-key="${app}"]`,

  /** A tab's own unseen badge. */
  tabBadge: '.pgn__tab-notification',

  /** One app's tab panel. */
  tabPanel: (app: string) => `[data-testid="notification-tab-${app}"]`,

  /** "Last 24 hours" / "Earlier" — a group of rows in a panel. */
  section: '[data-testid="notification-tray-section"]',

  /** "Mark all as read". */
  markAllRead: '[data-testid="mark-all-read"]',

  /** "Load more notifications". */
  loadMore: '[data-testid="load-more-notifications"]',

  /** "That's all of your recent notifications!" — the end of the list. */
  listComplete: '[data-testid="notifications-list-complete"]',

  /** "No notifications yet". */
  emptyList: '[data-testid="notifications-empty-list"]',

  /**
   * One row: an `<a target="_blank">` whose `href` is the notification's
   * `content_url`, keyed by the notification's id.
   */
  row: (id: number) => `a[data-testid="notification-${id}"]`,

  /** Every row in a panel. */
  anyRow: 'a.notification-post-link',

  /** A row's unread (red) dot. */
  unreadDot: (id: number) => `[data-testid="unread-notification-${id}"]`,
} as const;

/**
 * The preference centre, `{APPS}/account/#notifications`. Toggles are Paragon
 * switches (`input[role="switch"]`) keyed by the notification type in camel
 * case and the channel.
 */
export const NOTIFICATION_PREFERENCES_SELECTORS = {
  /** The section itself — "Notifications". */
  section: '#notifications',

  /** One app's group of preference rows — "Discussions", "Updates", "Grading". */
  app: (app: string) => `[data-testid="${app}-app"]`,

  /** The switch for one type and channel. */
  toggle: (type: string, channel: 'web' | 'email') =>
    `input[data-testid="toggle-${camelCase(type)}-${channel}"]`,

  /** Every web switch — one per preference the user is offered. */
  anyWebToggle: 'input[data-testid^="toggle-"][data-testid$="-web"]',
} as const;

/** `new_discussion_post` → `newDiscussionPost`, as the preference centre keys its switches. */
function camelCase(type: string): string {
  return type.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
