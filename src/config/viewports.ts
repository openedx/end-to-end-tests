/**
 * The one viewport table the responsive coverage runs from: the landing page,
 * the in-course sidebar and the accessibility gates all take their sizes from
 * here, so "phone" means the same thing in every spec.
 *
 * Each size sits on one side of a breakpoint the platform's own frontends
 * switch on, so a size exercises a layout rather than an arbitrary width:
 * Paragon's `sm` (576), `md` (768), `lg` (992) and `xl` (1200), the legacy
 * header's mobile switch (below 769) and the frontend-base shell header's
 * (`maxWidth: 768`), and the learning MFE's outline sidebar, which goes full
 * screen below `xl`.
 *
 * Responsiveness is asserted as structure (nothing scrolls sideways, every
 * primary link stays reachable), never against a pixel baseline (ADR-0002).
 */
export interface ViewportSpec {
  readonly name: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
}

export const VIEWPORTS = {
  /** Below `sm` and both headers' mobile switch — the sheet's "iOS and Android". */
  phone: {
    name: 'phone',
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
  },
  /** Paragon `md`: the shell header still shows its mobile layout at exactly 768. */
  tablet: {
    name: 'tablet',
    viewport: { width: 768, height: 1024 },
    isMobile: false,
    hasTouch: true,
  },
  /**
   * Above `lg` (the catalog's filters move into a sidebar) but below `xl`, where
   * the outline sidebar goes full screen — the sheet's "shrink the window".
   */
  smallDesktop: {
    name: 'small desktop',
    viewport: { width: 1024, height: 768 },
    isMobile: false,
    hasTouch: false,
  },
  /** Above `xl`; the width of the suite's default Desktop Chrome device. */
  desktop: {
    name: 'desktop',
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    hasTouch: false,
  },
} as const satisfies Record<string, ViewportSpec>;

/** The three sizes the public-site responsiveness case (TC-00061) walks. */
export const RESPONSIVE_VIEWPORTS: readonly ViewportSpec[] = [
  VIEWPORTS.phone,
  VIEWPORTS.tablet,
  VIEWPORTS.desktop,
];

/** The two sizes each new surface's accessibility gate runs at. */
export const A11Y_VIEWPORTS: readonly ViewportSpec[] = [VIEWPORTS.phone, VIEWPORTS.desktop];

/** `test.use(...)` options for one viewport (a fresh context, so `isMobile` applies). */
export function viewportUse(spec: ViewportSpec): {
  viewport: { width: number; height: number };
  isMobile: boolean;
  hasTouch: boolean;
} {
  return { viewport: { ...spec.viewport }, isMobile: spec.isMobile, hasTouch: spec.hasTouch };
}
