/**
 * The site chrome — the header and footer every LMS and MFE page is wrapped
 * in — across the three generations that render it:
 *
 * - **shell**: the `frontend-base` shell (`main`: catalog, learner dashboard,
 *   authn, …). One `<header class="border-bottom">` holding a wide and a
 *   narrow layout, one of them `d-none` (`BASE-002`); a
 *   `<footer class="d-flex flex-column">` with the site logo, the legal line,
 *   the language menu and "Powered by Open edX".
 * - **legacy**: `frontend-component-header` / `-footer` (verawood; learning,
 *   profile and account on `main` too): `header.site-header-desktop` or
 *   `.site-header-mobile`, and a footer holding only the Powered-by logo.
 * - **learning**: the legacy package's learning header,
 *   `header.learning-header`, with the course lockup in place of a main menu.
 *
 * Which pages render which generation is changing app by app while the shell
 * conversion is under way, so nothing here — or in the page objects — lists
 * apps: every anchor is a union of all three, scoped with `:visible` so the
 * shell's hidden layout never matches, and {@link CHROME_SELECTORS.generation}
 * tells the three apart from what actually rendered.
 *
 * Each anchor names the localized string it stands in for.
 */
export const CHROME_SELECTORS = {
  /** The page header, whichever generation rendered it. */
  header:
    ':is(header.border-bottom, header.site-header-desktop, header.site-header-mobile, header.learning-header):visible',

  /** One root per generation, for detecting which one a page rendered. */
  generation: {
    shell: 'header.border-bottom',
    learning: 'header.learning-header',
    legacy: ':is(header.site-header-desktop, header.site-header-mobile)',
  },

  /**
   * The header's brand link — the sheet's "icon on the upper left". The shell
   * wraps a Paragon `Image` in a `pgn__hyperlink`; both legacy headers use
   * `a.logo`.
   */
  headerLogoLink: ':is(a.logo, a.pgn__hyperlink:has(> img)):visible',

  /**
   * Primary navigation links — "Courses", "Programs", "Discover New",
   * "Explore courses". Paragon `NavLink`s in the shell, `nav.main-nav a.nav-link`
   * in the legacy desktop header; the learning header has none.
   */
  headerMainLink: 'a.nav-link:visible',

  /**
   * The signed-out call-to-action links — "Sign in" / "Login", "Register for
   * free" / "Sign Up". Every header generation renders them as buttons-styled
   * anchors; which is which is told apart by `href`, never by label.
   */
  headerAnonymousLink: 'a.btn:visible',

  /**
   * The narrow layout's menu toggle — the shell's `button.btn-outline` (which
   * has no accessible name, `BASE-003`), the legacy mobile header's "Main Menu"
   * `icon-button` (the left one; the right one is the account menu).
   */
  headerMenuToggle:
    ':is(header.border-bottom button.btn-outline, .site-header-mobile .justify-content-start button.icon-button):visible',

  /**
   * The menu the toggle opens: a `nav flex-column` in both — inside a focus
   * lock in the shell, inside the left `Menu` of the legacy mobile header.
   */
  headerMenuPanel:
    ':is(header.border-bottom [data-focus-lock-disabled], .site-header-mobile .justify-content-start) .nav.flex-column',

  /** The page footer, whichever generation rendered it. */
  footer: 'footer:visible',

  /**
   * The footer's image links: the site logo (shell only) and "Powered by Open
   * edX" (both generations, always the last).
   */
  footerImageLink: 'a:has(> img)',

  /**
   * The shell footer's legal line — "© {year} {siteName}." — the first of its
   * small centred notices. The legacy footer has none (`FOOTER-001`).
   */
  footerLegalNotice: '.text-center.x-small',

  /** The shell's language menu — "English" and the other site languages. */
  languageMenuTrigger: '#language-menu-dropdown-trigger',
} as const;
