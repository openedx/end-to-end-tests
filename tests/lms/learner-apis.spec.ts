import { expect, test } from '../../src/fixtures';
import {
  ADULT_YEAR_OF_BIRTH,
  addBookmark,
  fetchAccount,
  fetchLearnerHome,
  fetchPreferences,
  fetchResumePoint,
  fetchUserTours,
  learnerHomeCourse,
  listBookmarks,
  recordCompletion,
  removeBookmark,
  setCourseEmailOptIn,
  updateAccount,
  updatePreferences,
  type LearnerHome,
} from '../../src/api';

/**
 * Proof-of-life for the learner-side APIs the Epic 14 specs assert on, with no
 * UI: each one answers a fresh learner in the shape the suite expects and
 * round-trips a write. The fastest signal that a target's learner APIs are as
 * the profile, bookmark, dashboard, tour and resume cases assume — every one of
 * them builds on these readings.
 */
test.describe('Learner APIs bootstrap', { tag: ['@smoke', '@authenticated'] }, () => {
  test('round-trips a bookmark on the learner session', async ({
    request,
    config,
    enrolledCourse,
    courseOutline,
  }) => {
    const { courseKey, identity } = enrolledCourse;
    const unit = courseOutline.units[0];
    expect(unit, 'the course has at least one unit').toBeDefined();
    const usageId = unit!.id;

    expect(await listBookmarks(request, config, courseKey)).toEqual([]);
    const created = await addBookmark(request, config, usageId);
    expect(created.id).toBe(`${identity.username},${usageId}`);
    expect((await listBookmarks(request, config, courseKey)).map((b) => b.usage_id)).toEqual([
      usageId,
    ]);

    await removeBookmark(request, config, identity.username, usageId);
    expect(await listBookmarks(request, config, courseKey)).toEqual([]);
  });

  test('round-trips profile fields and a preference', async ({
    request,
    config,
    courseLearner,
  }) => {
    const { username } = courseLearner.identity;

    // A fresh account has no year of birth, so the platform keeps it private.
    const fresh = await fetchAccount(request, config, username);
    expect(fresh.requires_parental_consent).toBe(true);

    await updateAccount(request, config, username, {
      year_of_birth: ADULT_YEAR_OF_BIRTH,
      level_of_education: 'b',
      social_links: [{ platform: 'linkedin', social_link: `https://linkedin.com/in/${username}` }],
    });
    const updated = await fetchAccount(request, config, username);
    expect(updated.requires_parental_consent).toBe(false);
    expect(updated.level_of_education).toBe('b');
    expect(updated.social_links?.map((link) => link.platform)).toEqual(['linkedin']);

    await updatePreferences(request, config, username, { 'visibility.bio': 'private' });
    expect((await fetchPreferences(request, config, username))['visibility.bio']).toBe('private');
    await updatePreferences(request, config, username, { 'visibility.bio': null });
    expect(await fetchPreferences(request, config, username)).not.toHaveProperty('visibility.bio');
  });

  test('reads the dashboard, refuses a learner "View as", and round-trips the e-mail opt-out', async ({
    request,
    config,
    enrolledCourse,
  }) => {
    const { courseKey, identity } = enrolledCourse;
    const home = (await fetchLearnerHome(request, config)) as LearnerHome;
    const card = learnerHomeCourse(home, courseKey);
    expect(card?.enrollment.isEnrolled).toBe(true);
    expect(card?.enrollment.hasOptedOutOfEmail).toBe(false);

    // Only global staff may view the dashboard as someone else.
    expect(await fetchLearnerHome(request, config, { user: identity.username })).toEqual({
      forbidden: true,
    });

    const optedOut = async () =>
      learnerHomeCourse((await fetchLearnerHome(request, config)) as LearnerHome, courseKey)
        ?.enrollment.hasOptedOutOfEmail;
    await setCourseEmailOptIn(request, config, courseKey, false);
    expect(await optedOut()).toBe(true);
    await setCourseEmailOptIn(request, config, courseKey, true);
    expect(await optedOut()).toBe(false);
  });

  test('offers a new learner the course-home tour', async ({ request, config, courseLearner }) => {
    expect(await fetchUserTours(request, config, courseLearner.identity.username)).toEqual({
      course_home_tour_status: 'show-new-user-tour',
      show_courseware_tour: true,
    });
  });

  test('resumes at the most recently completed block', async ({
    request,
    config,
    enrolledCourse,
    courseOutline,
  }) => {
    const { courseKey, identity } = enrolledCourse;
    const unit = courseOutline.units.find(
      (u) => u.childIds.length > 0 && u !== courseOutline.units[0],
    );
    expect(unit, 'the course has a second unit with content').toBeDefined();
    const blockId = unit!.childIds[0]!;

    await recordCompletion(request, config, identity.username, courseKey, blockId);
    expect(await fetchResumePoint(request, config, courseKey)).toMatchObject({
      block_id: blockId,
      unit_id: unit!.id,
    });
  });
});
