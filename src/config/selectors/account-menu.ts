/**
 * The header account menu that carries the sign-out affordance, rendered by the
 * page chrome every signed-in MFE screen shares.
 *
 * Each anchor names the localized string it stands in for, per
 * `src/config/selectors/README.md`.
 */
export const ACCOUNT_MENU_SELECTORS = {
  /**
   * The menu trigger — the sheet's account/avatar menu.
   *
   * Two headers across the supported releases, so two shapes, matched as a union:
   *
   * - up to and including **verawood** (`frontend-component-header`):
   *   `<button class="menu-trigger btn…" aria-label="Account menu for {username}">`,
   *   with no `id`;
   * - on **main** (the `frontend-base` shell):
   *   `<button id="user-nav-dropdown" class="btn-avatar…">`, with no
   *   `menu-trigger` class.
   *
   * Both branches are structural. Deliberately *not* anchored on the accessible
   * name even though verawood's contains the username: on main the name is the
   * learner's **display name**, so there is no value a caller could pass that
   * works on both — which is why this takes no username.
   *
   * `:visible` is required on main, where the shell renders the whole header
   * twice — a wide and a narrow variant, one of them `d-none` — duplicating this
   * `id` within one document (invalid HTML; `BASE-002`). It is a no-op on the
   * older header, which renders once. Drop it once the shell stops duplicating.
   */
  menuTrigger: 'button:is(#user-nav-dropdown, .menu-trigger):visible',

  /** Sign out — anchored by its `/logout` href, immune to label/translation. */
  signOutLink: 'a[href*="/logout"]',
} as const;
