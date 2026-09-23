import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { lmsGet, lmsWrite } from './lms-json';

/**
 * Course notifications (`openedx/core/djangoapps/notifications`, verawood
 * onward): the tray's list and unseen count, seen/read state, and the v3
 * preferences. Everything is the **recipient's** own reading, on its own
 * session — the oracle of the notification specs (ADR-0002: the UI drives, the
 * API decides).
 *
 * Two states are easy to confuse, and the platform keeps them apart (measured):
 * a row is **seen** once its tray tab is opened (`PUT mark-seen/<app>/`, which
 * is all `count/` counts) and **read** once it is clicked or "mark all as read"
 * runs (`PATCH read/`, which clears its unread dot but not the count).
 */
const base = (config: AppConfig) => `${config.baseUrls.lms}/api/notifications`;

/** The three notification apps, which are also the tray's tabs. */
export const NOTIFICATION_APPS = ['discussion', 'updates', 'grading'] as const;
export type NotificationApp = (typeof NOTIFICATION_APPS)[number];

/** One notification as the list API returns it. */
export interface PlatformNotification {
  readonly id: number;
  readonly app_name: NotificationApp;
  readonly notification_type: string;
  /**
   * Type-specific data: `thread_id`, `post_title`, `replier_name` for forum
   * types; `course_update_content` for updates; `ora_name`, `points_earned`
   * for grading. `grouped: true` marks a row others merged into.
   */
  readonly content_context: Readonly<Record<string, unknown>>;
  /** Rendered HTML of the row (localized — never matched). */
  readonly content: string;
  /** Where the row routes: the post, the updates page, the ORA. */
  readonly content_url: string;
  readonly course_id: string;
  readonly last_read: string | null;
  readonly last_seen: string | null;
  readonly created: string;
}

export interface NotificationPage {
  readonly count: number;
  readonly num_pages: number;
  readonly current_page: number;
  readonly next: string | null;
  readonly results: readonly PlatformNotification[];
}

/** Lists the caller's notifications, newest first, ten to a page by default. */
export async function listNotifications(
  request: APIRequestContext,
  config: AppConfig,
  options: {
    readonly app?: NotificationApp;
    readonly page?: number;
    readonly pageSize?: number;
  } = {},
): Promise<NotificationPage> {
  const query = new URLSearchParams();
  if (options.app) query.set('app_name', options.app);
  if (options.page) query.set('page', String(options.page));
  if (options.pageSize) query.set('page_size', String(options.pageSize));
  const suffix = query.size > 0 ? `?${query}` : '';
  return lmsGet(request, `${base(config)}/${suffix}`, 'Listing notifications');
}

export interface NotificationCount {
  readonly show_notifications_tray: boolean;
  /** Unseen notifications, all apps. */
  readonly count: number;
  readonly count_by_app_name: Readonly<Record<NotificationApp, number>>;
  readonly notification_expiry_days: number;
}

/** The unseen counts the bell and the tray tabs show. */
export async function fetchNotificationCount(
  request: APIRequestContext,
  config: AppConfig,
): Promise<NotificationCount> {
  return lmsGet(request, `${base(config)}/count/`, 'Reading the notification count');
}

/** Marks an app's notifications seen — what opening its tray tab sends. */
export async function markNotificationsSeen(
  request: APIRequestContext,
  config: AppConfig,
  app: NotificationApp,
): Promise<void> {
  await lmsWrite(
    request,
    config,
    'PUT',
    `${base(config)}/mark-seen/${app}/`,
    `Marking ${app} seen`,
  );
}

/** Marks one notification, or a whole app's, read. */
export async function markNotificationsRead(
  request: APIRequestContext,
  config: AppConfig,
  target: { readonly notificationId: number } | { readonly app: NotificationApp },
): Promise<void> {
  const data =
    'notificationId' in target
      ? { notification_id: target.notificationId }
      : { app_name: target.app };
  await lmsWrite(request, config, 'PATCH', `${base(config)}/read/`, 'Marking notifications read', {
    data,
  });
}

export const EMAIL_CADENCES = ['Daily', 'Weekly', 'Immediately', 'Never'] as const;
export type EmailCadence = (typeof EMAIL_CADENCES)[number];

/** One type's settings. `push` is non-editable for every stock type. */
export interface NotificationTypePreference {
  readonly web: boolean;
  readonly push: boolean;
  readonly email: boolean;
  readonly email_cadence: EmailCadence;
}

export interface NotificationAppPreferences {
  readonly enabled: boolean;
  /**
   * Keyed by type. `grouped_notification` stands for the seven "Activity
   * notifications" types (responses, comments, followed posts, endorsements),
   * which the preference centre shows and sets as one. Role-gated types appear
   * only where the user holds the role in some course: `content_reported` for
   * forum moderators, `ora_staff_notifications` for course staff.
   */
  readonly notification_types: Readonly<Record<string, NotificationTypePreference>>;
  readonly non_editable: Readonly<Record<string, readonly string[]>>;
}

export interface NotificationPreferences {
  readonly show_preferences: boolean;
  readonly show_email_preferences: boolean;
  readonly data: Readonly<Record<NotificationApp, NotificationAppPreferences>>;
}

const preferencesUrl = (config: AppConfig) => `${base(config)}/v3/configurations/`;

/**
 * The caller's preferences. They are per **user**, not per course: one toggle
 * applies to every course the learner is in.
 */
export async function fetchNotificationPreferences(
  request: APIRequestContext,
  config: AppConfig,
): Promise<NotificationPreferences> {
  return lmsGet(request, preferencesUrl(config), 'Reading notification preferences');
}

/** Turns one channel of one type on or off (`grouped_notification` for all activity types). */
export async function setNotificationPreference(
  request: APIRequestContext,
  config: AppConfig,
  preference: {
    readonly app: NotificationApp;
    readonly type: string;
    readonly channel: 'web' | 'email';
    readonly value: boolean;
  },
): Promise<void> {
  await lmsWrite(
    request,
    config,
    'PUT',
    preferencesUrl(config),
    `Setting ${preference.app}/${preference.type} ${preference.channel}=${preference.value}`,
    {
      data: {
        notification_app: preference.app,
        notification_type: preference.type,
        notification_channel: preference.channel,
        value: preference.value,
      },
    },
  );
}

/**
 * Sets one type's e-mail cadence. `notification_channel: 'email_cadence'` is
 * required: without it the platform answers 500 (`NOTIF-001`).
 */
export async function setEmailCadence(
  request: APIRequestContext,
  config: AppConfig,
  preference: {
    readonly app: NotificationApp;
    readonly type: string;
    readonly cadence: EmailCadence;
  },
): Promise<void> {
  await lmsWrite(
    request,
    config,
    'PUT',
    preferencesUrl(config),
    `Setting ${preference.app}/${preference.type} cadence=${preference.cadence}`,
    {
      data: {
        notification_app: preference.app,
        notification_type: preference.type,
        notification_channel: 'email_cadence',
        email_cadence: preference.cadence,
      },
    },
  );
}
