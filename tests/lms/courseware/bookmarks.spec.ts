import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { courseTool, fetchCourseHomeOutline, listBookmarks } from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Bookmarks (TC-00036): a learner bookmarks a unit, finds it through the
 * course home's Bookmarks tool, opens it from there, and removes the bookmark.
 * The bookmarks API decides each state; the button's state class and the
 * Bookmarks page's rows are the rendering the case describes.
 */
test(
  'bookmarks a unit, lists it under the Bookmarks tool, and removes it',
  { tag: ['@regression', '@authenticated', '@mfe-learning'], annotation: testId('TC-00036') },
  async ({
    page,
    request,
    config,
    unitPage,
    courseOutlinePage,
    courseToolsPage,
    courseOutline,
    enrolledCourse,
  }) => {
    const { courseKey } = enrolledCourse;
    const unit = courseOutline.units[0]!;

    await unitPage.goto(courseKey, unit.sequentialId, unit.id);
    expect(await unitPage.isBookmarked()).toBe(false);
    expect((await unitPage.toggleBookmark()).status()).toBe(201);
    await expect.poll(() => unitPage.isBookmarked()).toBe(true);
    expect((await listBookmarks(request, config, courseKey)).map((b) => b.usage_id)).toEqual([
      unit.id,
    ]);

    // The course home's Bookmarks tool lists the unit, and opens it.
    const tool = courseTool(
      await fetchCourseHomeOutline(request, config, courseKey),
      'edx.bookmarks',
    );
    expect(tool, 'the course home offers the Bookmarks tool').toBeDefined();
    await courseOutlinePage.goto(courseKey);
    await courseOutlinePage.dismissTourDialog();
    await expect(courseOutlinePage.toolLink(tool!.url)).toBeVisible();
    await courseToolsPage.gotoBookmarks(tool!.url);
    await expect(courseToolsPage.bookmarkRow(unit.id)).toBeVisible();
    // LMS-001: the page's "Course" breadcrumb link is told apart by colour only.
    await checkA11y(page, {
      label: 'course-bookmarks',
      additionalBaseline: ['link-in-text-block'],
    });
    await courseToolsPage.openBookmark(unit.id);

    // Removing the bookmark takes it off the list.
    await unitPage.waitForContent();
    expect((await unitPage.toggleBookmark()).status()).toBe(204);
    await expect.poll(() => unitPage.isBookmarked()).toBe(false);
    expect(await listBookmarks(request, config, courseKey)).toEqual([]);
    await courseToolsPage.gotoBookmarks(tool!.url);
    await expect(courseToolsPage.bookmarkRow(unit.id)).toHaveCount(0);
    await expect(courseToolsPage.bookmarksEmpty).toBeVisible();
  },
);
