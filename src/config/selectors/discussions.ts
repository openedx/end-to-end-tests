/**
 * The discussions MFE (`frontend-app-discussions`, `{APPS}/discussions/<course>/`).
 * Measured on local `main` 2026-09-23.
 *
 * The MFE ships test ids for posts, comments and the actions menu but not for
 * its navigation, the "Add a post" button or the post actions on the hover
 * card, so those are reached by `href` or structure. Each anchor names the
 * localized string it stands in for, per `src/config/selectors/README.md`.
 */
export const DISCUSSIONS_SELECTORS = {
  /**
   * A view link in the header nav — "All posts", "My posts", "Topics",
   * "Learners" — keyed by the route it links to.
   */
  viewLink: (courseKey: string, view: string) => `a.nav-link[href$="/${courseKey}/${view}"]`,

  /** The search field — "Search all posts". */
  searchInput: 'input[name="searchfield-input"]',

  /** "Add a post" — the only brand-coloured button in the posts pane. */
  addPostButton: 'button.btn-brand',

  /** A post's row in the list, keyed by the thread id it links to. */
  postListItem: (threadId: string) => `a.discussion-post[href$="/posts/${threadId}"]`,

  /** Every post row in the list. */
  anyPostListItem: 'a.discussion-post',

  /** The open post (thread) card. */
  post: (threadId: string) => `[data-testid="post-${threadId}"]`,

  /** A response or comment card. */
  comment: (commentId: string) => `[data-testid="comment-${commentId}"]`,

  /** The action bar a card shows on hover. */
  hoverCard: (id: string) => `#hover-card-${id}`,

  /**
   * On a hover card: "Add response" / "Add comment" — its one text button.
   * The icon buttons are told apart by their icons' classes, since each carries
   * only a localized `aria-label` ("Like", "Follow", "Actions menu").
   */
  addReplyButton: 'button.btn-tertiary',
  likeButton: 'button:has(.like-icon-dimensions)',
  followButton: 'button:has(.follow-icon-dimensions)',
  /** "Actions menu" (⋯) — the last button on a hover card. */
  actionsButton: '.hover-button:last-child button',

  /** The actions menu once open. */
  actionsMenu: '[data-testid="actions-dropdown-modal-popup"]',

  /**
   * One actions-menu item — `copy-link`, `edit`, `report`, `delete`,
   * `endorse`, … ("Copy link", "Edit", "Report", "Delete").
   */
  actionsMenuItem: (action: string) =>
    `[data-testid="actions-dropdown-modal-popup"] [data-testid="${action}"]`,

  /** Every item the actions menu offers. */
  anyActionsMenuItem: '[data-testid="actions-dropdown-modal-popup"] button[data-testid]',

  /** The post editor. */
  editor: {
    /** "Discussion" / "Question" radios. */
    postType: (type: 'discussion' | 'question') => `input#post-type-${type}`,
    topicSelect: '[data-testid="topic-select"]',
    titleInput: '[data-testid="post-title-input"]',
    /** The TinyMCE body frame of the new-post editor. */
    bodyFrame: 'iframe#post-editor-new_ifr',
    /** "Notify all learners" — offered to staff, instructors and moderators. */
    notifyAllLearners: '#notify-learners',
    /** "Submit" — Paragon's stateful primary button. */
    submit: 'button.pgn__stateful-btn.btn-primary',
  },
} as const;
