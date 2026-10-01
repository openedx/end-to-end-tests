import type { FrameLocator, Locator, Page, Response } from '@playwright/test';

import { DISCUSSIONS_SELECTORS, type AppConfig } from '../../../config';

/** The four learner views of the Discussion tab (TC-00311). */
export type DiscussionsView = 'posts' | 'my-posts' | 'topics' | 'learners';

/** The JSON body of a `PATCH`, or `{}` when it has none. */
function patchBody(response: Response): Record<string, unknown> {
  try {
    return (response.request().postDataJSON() ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** A thread or comment write the MFE sends, recognised by method and path. */
function isDiscussionWrite(
  config: AppConfig,
  method: string,
  resource: 'threads' | 'comments',
  id?: string,
) {
  const path = `${config.baseUrls.lms}/api/discussion/v1/${resource}/${id ? `${id}/` : ''}`;
  return (response: Response) =>
    response.request().method() === method && response.url().split('?')[0] === path;
}

/**
 * The discussions MFE (`{APPS}/discussions/<course>/…`): the post list, its
 * search and views, one open post, and the new-post editor.
 *
 * The same MFE renders inside the learning MFE's discussions sidebar (an iframe
 * of its in-context view), so every locator is taken from `root` — the page
 * itself, or that frame — while responses are awaited on the page, which sees
 * the frame's requests too.
 *
 * Each action waits for the discussion-API request it causes and returns it;
 * the spec reads the outcome from `src/api/discussions.ts`.
 */
export class DiscussionsPage {
  private readonly s = DISCUSSIONS_SELECTORS;

  readonly searchInput: Locator;
  readonly addPostButton: Locator;
  readonly postListItems: Locator;
  readonly actionsMenu: Locator;
  readonly actionsMenuItems: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
    private readonly root: Page | FrameLocator = page,
  ) {
    this.searchInput = root.locator(this.s.searchInput);
    this.addPostButton = root.locator(this.s.addPostButton);
    this.postListItems = root.locator(this.s.anyPostListItem);
    this.actionsMenu = root.locator(this.s.actionsMenu);
    this.actionsMenuItems = root.locator(this.s.anyActionsMenuItem);
  }

  url(courseKey: string, view: DiscussionsView = 'posts'): string {
    return `${this.config.baseUrls.apps}/discussions/${courseKey}/${view}`;
  }

  /** Opens a view and waits for the thread list (or topics) it loads. */
  async goto(courseKey: string, view: DiscussionsView = 'posts'): Promise<void> {
    await this.page.goto(this.url(courseKey, view));
    await this.viewLink(courseKey, view).waitFor();
  }

  /** A view link in the header nav ("All posts", "My posts", "Topics", "Learners"). */
  viewLink(courseKey: string, view: DiscussionsView): Locator {
    return this.root.locator(this.s.viewLink(courseKey, view));
  }

  /** Switches view through its nav link. */
  async openView(courseKey: string, view: DiscussionsView): Promise<void> {
    await this.viewLink(courseKey, view).click();
    await this.page.waitForURL(`**/discussions/${courseKey}/${view}**`);
  }

  /** Searches the posts, waiting for the `text_search` query the MFE sends. */
  async searchFor(text: string): Promise<Response> {
    await this.searchInput.fill(text);
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (candidate) =>
          candidate.url().startsWith(`${this.config.baseUrls.lms}/api/discussion/v1/threads/?`) &&
          new URL(candidate.url()).searchParams.get('text_search') === text,
      ),
      this.searchInput.press('Enter'),
    ]);
    return response;
  }

  /** A post's row in the list. */
  postListItem(threadId: string): Locator {
    return this.root.locator(this.s.postListItem(threadId));
  }

  /** The open post card. */
  post(threadId: string): Locator {
    return this.root.locator(this.s.post(threadId));
  }

  /** A response or comment card. */
  comment(commentId: string): Locator {
    return this.root.locator(this.s.comment(commentId));
  }

  /** Opens a post from the list. */
  async openPost(threadId: string): Promise<void> {
    await this.postListItem(threadId).click();
    await this.post(threadId).waitFor();
  }

  /** A card's hover action bar (the post's, a response's or a comment's). */
  private hoverCard(id: string): Locator {
    return this.root.locator(this.s.hoverCard(id));
  }

  private async hovered(card: Locator, id: string): Promise<Locator> {
    await card.hover();
    return this.hoverCard(id);
  }

  /** Likes (or unlikes) the open post, waiting for its `PATCH` (`voted`). */
  async likePost(threadId: string): Promise<Response> {
    const bar = await this.hovered(this.post(threadId), threadId);
    return this.threadPatch(threadId, 'voted', () => bar.locator(this.s.likeButton).click());
  }

  /** Follows (or unfollows) the open post, waiting for its `PATCH` (`following`). */
  async followPost(threadId: string): Promise<Response> {
    const bar = await this.hovered(this.post(threadId), threadId);
    return this.threadPatch(threadId, 'following', () => bar.locator(this.s.followButton).click());
  }

  /** Opens the actions menu (⋯) of the post or of one response/comment. */
  async openActionsMenu(target: { readonly threadId: string } | { readonly commentId: string }) {
    const id = 'threadId' in target ? target.threadId : target.commentId;
    const card = 'threadId' in target ? this.post(id) : this.comment(id);
    const bar = await this.hovered(card, id);
    await bar.locator(this.s.actionsButton).click();
    await this.actionsMenu.waitFor();
  }

  /** The test ids of the open actions menu's items, in order (`copy-link`, `report`, …). */
  async actionsMenuItemIds(): Promise<string[]> {
    return this.actionsMenuItems.evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-testid') ?? ''),
    );
  }

  /** One item of the open actions menu (`copy-link`, `edit`, `report`, `delete`, …). */
  actionsMenuItem(action: string): Locator {
    return this.root.locator(this.s.actionsMenuItem(action));
  }

  /**
   * Responds to the open post through its hover card's "Add response", waiting
   * for the `POST v1/comments/`; the new response is in its body.
   */
  async respondToPost(threadId: string, text: string): Promise<Response> {
    const bar = await this.hovered(this.post(threadId), threadId);
    await bar.locator(this.s.addReplyButton).click();
    const body = this.root.frameLocator(this.s.editor.commentBodyFrame).locator('body');
    await body.click();
    await body.pressSequentially(text);
    const [response] = await Promise.all([
      this.page.waitForResponse(isDiscussionWrite(this.config, 'POST', 'comments')),
      this.root.locator(this.s.editor.submit).first().click(),
    ]);
    return response;
  }

  /** Edits the open post's title through its actions menu, waiting for the `PATCH`. */
  async editPostTitle(threadId: string, title: string): Promise<Response> {
    await this.openActionsMenu({ threadId });
    await this.actionsMenuItem('edit').click();
    const editor = new PostEditor(this.page, this.config, this.root);
    await editor.titleInput.fill(title);
    return this.threadPatch(threadId, 'title', () => editor.submitButton.click());
  }

  /** Deletes the open post through its actions menu and the confirmation dialog. */
  async deletePost(threadId: string): Promise<Response> {
    await this.openActionsMenu({ threadId });
    await this.actionsMenuItem('delete').click();
    const [response] = await Promise.all([
      this.page.waitForResponse(isDiscussionWrite(this.config, 'DELETE', 'threads', threadId)),
      this.root.locator(this.s.dialogConfirm).click(),
    ]);
    return response;
  }

  /** Reports the open post through its actions menu and the confirmation dialog. */
  async reportPost(threadId: string): Promise<Response> {
    await this.openActionsMenu({ threadId });
    await this.actionsMenuItem('report').click();
    return this.threadPatch(threadId, 'abuse_flagged', () =>
      this.root.locator(this.s.dialogConfirm).click(),
    );
  }

  /**
   * "Copy link" from the open post's actions menu. The link goes to the
   * clipboard, so the caller's context needs the clipboard permissions; this
   * returns what landed there.
   */
  async copyPostLink(threadId: string): Promise<string> {
    await this.openActionsMenu({ threadId });
    await this.actionsMenuItem('copy-link').click();
    return this.page.evaluate(() => navigator.clipboard.readText());
  }

  /** Starts a new post from "Add a post" and returns its editor. */
  async startPost(): Promise<PostEditor> {
    await this.addPostButton.click();
    const editor = new PostEditor(this.page, this.config, this.root);
    await editor.titleInput.waitFor();
    return editor;
  }

  /**
   * Runs `action` and waits for the thread `PATCH` that writes `field`. The MFE
   * also PATCHes a thread on its own (`read` when a post is opened), so a wait
   * on the method and path alone can catch the wrong write.
   */
  private async threadPatch(
    threadId: string,
    field: string,
    action: () => Promise<void>,
  ): Promise<Response> {
    const isWrite = isDiscussionWrite(this.config, 'PATCH', 'threads', threadId);
    const [response] = await Promise.all([
      this.page.waitForResponse((candidate) => isWrite(candidate) && field in patchBody(candidate)),
      action(),
    ]);
    return response;
  }
}

/**
 * The new-post form: type, topic, title, and a TinyMCE body. TinyMCE's toolbar
 * carries only localized labels, so the body is typed into its frame directly.
 */
export class PostEditor {
  private readonly s = DISCUSSIONS_SELECTORS.editor;

  readonly titleInput: Locator;
  readonly topicSelect: Locator;
  readonly notifyAllLearners: Locator;
  readonly submitButton: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
    private readonly root: Page | FrameLocator,
  ) {
    this.titleInput = root.locator(this.s.titleInput);
    this.topicSelect = root.locator(this.s.topicSelect);
    this.notifyAllLearners = root.locator(this.s.notifyAllLearners);
    this.submitButton = root.locator(this.s.submit);
  }

  /**
   * Fills the form. On the full-page MFE pass `topicId`: the editor's default
   * is empty on some courses (measured), and Submit then does nothing. Omit it
   * only in the in-unit sidebar, whose editor is fixed to the unit's topic.
   */
  async fill(post: {
    readonly type?: 'discussion' | 'question';
    readonly topicId?: string;
    readonly title: string;
    readonly body: string;
  }): Promise<void> {
    if (post.type) await this.root.locator(this.s.postType(post.type)).check();
    if (post.topicId) await this.topicSelect.selectOption(post.topicId);
    // The rich-text body loads last, and the form resets its fields while it
    // loads (measured on CI `main`: a title typed first was blanked, so Submit
    // failed validation). Typing into the body first means the form has
    // settled; the title goes in last.
    const body = this.root.frameLocator(this.s.bodyFrame).locator('body');
    await body.click();
    await body.pressSequentially(post.body);
    await this.titleInput.fill(post.title);
  }

  /** Submits, waiting for the `POST v1/threads/`; the new thread is in its body. */
  async submit(): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(isDiscussionWrite(this.config, 'POST', 'threads')),
      this.submitButton.click(),
    ]);
    return response;
  }
}
