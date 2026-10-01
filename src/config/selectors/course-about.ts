/**
 * Course About page (`${APPS}/catalog/courses/{courseKey}/about`).
 *
 * Note what is *not* here: there is no anchor for the sheet's "You are enrolled
 * in this course" disabled button, because on this platform version the enrolled
 * state does not render a disabled button at all — the call to action becomes a
 * link into the courseware ({@link courseAboutCoursewareLink}). Asserting on the
 * link's presence is both non-localized and closer to what the learner can
 * actually do next.
 */
export const COURSE_ABOUT_SELECTORS = {
  /**
   * The enroll call to action — the sheet's "Enroll Now" button. The MFE gives it
   * no test ID and posts through the enrollment API rather than a form, so the
   * best available anchor is Paragon's stateful-button class scoped to the page's
   * main landmark (the only other button is the header account menu). Weak by our
   * standards; an upstream test-ID request is filed as plan §4 item 5.
   */
  enrollButton: 'main button.pgn__stateful-btn',

  /**
   * The share links — the sheet's Facebook, Twitter and e-mail "share" icons.
   * Paragon hyperlinks with only an icon and screen-reader text, so each is
   * anchored by the share service its `href` targets; the links are never
   * followed off-site.
   */
  shareTwitter: 'main a[href^="https://twitter.com/intent/tweet"]',
  shareFacebook: 'main a[href^="https://www.facebook.com/sharer/sharer.php"]',
  shareEmail: 'main a[href^="mailto:"]',

  /**
   * The course overview — the HTML an author writes in Schedule & Details,
   * rendered by the platform's about block (sanitised) with asset paths pointed
   * at the LMS.
   */
  overview: 'main .course-about-overview',

  /** The course image — the sheet's "course photo". */
  mediaImage: 'main img.course-media-image',

  /**
   * The intro-video play button ("Play course introduction video"), which wraps
   * the course image when the course has an intro video.
   */
  introVideoButton: 'main button:has(> img.course-media-image)',

  /** The intro video's player, rendered in a modal once the button is pressed. */
  introVideoFrame: '[role="dialog"] iframe[src*="youtube.com/embed/"]',

  /** Label/value pairs in the details sidebar. Positional only — see plan §4.4. */
  detailsItemLabel: '[data-testid="sidebar-details-item-label"]',
  detailsItemValue: '[data-testid="sidebar-details-item-value"]',
} as const;

/**
 * The courseware link the page renders once the learner is enrolled — the
 * enrolled-state signal, replacing the sheet's "You are enrolled in this course"
 * copy. Corroborate with the enrollment API, which is authoritative.
 */
export function courseAboutCoursewareLink(courseKey: string): string {
  return `main a[href*="/learning/course/${courseKey}"]`;
}
