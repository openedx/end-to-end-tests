import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { assertAdminPage, openAdminForm, postAdminForm } from './django-admin';

/**
 * The platform's course e-mail switches, which have no REST API — only the LMS
 * Django admin. Course e-mail is **off on a default install**: the
 * `BulkEmailFlag` configuration turns the feature on, and while its "require
 * course e-mail authorization" stays on (the default) each course needs a
 * `CourseAuthorization` row too. The learner dashboard offers a course's
 * "Email settings" only once both hold.
 *
 * The flag is turned on with course authorization still required, and one
 * course is authorized, so the change is scoped to that course: no other
 * course on the install gains e-mail. `adminSession` must be an LMS Django
 * session for a superuser (`adminLms`).
 */
const FLAG_ADD = '/admin/bulk_email/bulkemailflag/add/';
const AUTHORIZATION_ADMIN = '/admin/bulk_email/courseauthorization';

export async function enableCourseEmail(
  adminSession: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<void> {
  const lms = config.baseUrls.lms;
  // The authorization model has one row per course and its admin has no
  // search, so the change list is read whole for this course's key. A course
  // already authorized was authorized after the flag was turned on, so a
  // repeat call writes nothing.
  const listUrl = `${lms}${AUTHORIZATION_ADMIN}/`;
  const list = await adminSession.get(listUrl);
  const listHtml = await list.text();
  assertAdminPage(listHtml, list.status(), listUrl, 'Listing course e-mail authorizations');
  if (listHtml.includes(courseKey)) return;

  // A ConfigurationModel: a new enabled row turns it on.
  const flag = await openAdminForm(adminSession, `${lms}${FLAG_ADD}`, 'Enabling course e-mail');
  await postAdminForm(
    adminSession,
    `${lms}${FLAG_ADD}`,
    flag.token,
    { enabled: 'on', require_course_email_auth: 'on' },
    'Enabling course e-mail',
  );

  const add = `${lms}${AUTHORIZATION_ADMIN}/add/`;
  const form = await openAdminForm(adminSession, add, `Authorizing e-mail for ${courseKey}`);
  await postAdminForm(
    adminSession,
    add,
    form.token,
    { course_id: courseKey, email_enabled: 'on' },
    `Authorizing e-mail for ${courseKey}`,
  );
}
