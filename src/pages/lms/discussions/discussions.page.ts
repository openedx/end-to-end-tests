import type { FrameLocator, Locator, Page, Response } from '@playwright/test';

import { DISCUSSIONS_SELECTORS, type AppConfig } from '../../../config';

/** The four learner views of the Discussion tab (TC-00311). */
export type DiscussionsView = 'posts' | 'my-posts' | 'topics' | 'learners';

/** A thread write the MFE sends, recognised by method and path. */
function isThreadsWrite(config: AppConfig, method: string, threadId?: string) {
  const path = `${config.baseUrls.lms}/api/discussion/v1/threads/${threadId ? `${threadId}/` : ''}`;
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
    return this.threadPatch(threadId, () => bar.locator(this.s.likeButton).click());
  }

  /** Follows (or unfollows) the open post, waiting for its `PATCH` (`following`). */
  async followPost(threadId: string): Promise<Response> {
    const bar = await this.hovered(this.post(threadId), threadId);
    return this.threadPatch(threadId, () => bar.locator(this.s.followButton).click());
  }

  /** Opens the actions menu (⋯) of the post or of one response/comment. */
  async openActionsMenu(target: { readonly threadId: string } | { readonly commentId: string }) {
    const id = 'threadId' in target ? target.threadId : target.commentId;
    const card = 'threadId' in target ? this.post(id) : this.comment(id);
    const bar = await this.hovered(card, id);
    await bar.locator(this.s.actionsButton).click();
    await this.actionsMenu.waitFor();
  }

  /** One item of the open actions menu (`copy-link`, `edit`, `report`, `delete`, …). */
  actionsMenuItem(action: string): Locator {
    return this.root.locator(this.s.actionsMenuItem(action));
  }

  /** Starts a new post from "Add a post" and returns its editor. */
  async startPost(): Promise<PostEditor> {
    await this.addPostButton.click();
    const editor = new PostEditor(this.page, this.config, this.root);
    await editor.titleInput.waitFor();
    return editor;
  }

  private async threadPatch(threadId: string, action: () => Promise<void>): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(isThreadsWrite(this.config, 'PATCH', threadId)),
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
   * Fills the form. The topic is always chosen explicitly: the editor's default
   * is empty on some courses (measured), and Submit then does nothing.
   */
  async fill(post: {
    readonly type?: 'discussion' | 'question';
    readonly topicId: string;
    readonly title: string;
    readonly body: string;
  }): Promise<void> {
    if (post.type) await this.root.locator(this.s.postType(post.type)).check();
    await this.topicSelect.selectOption(post.topicId);
    await this.titleInput.fill(post.title);
    const body = this.root.frameLocator(this.s.bodyFrame).locator('body');
    await body.click();
    await body.pressSequentially(post.body);
  }

  /** Submits, waiting for the `POST v1/threads/`; the new thread is in its body. */
  async submit(): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(isThreadsWrite(this.config, 'POST')),
      this.submitButton.click(),
    ]);
    return response;
  }
}
