/**
 * The course Teams page — the LMS's own Backbone page at
 * `/courses/<key>/teams/`, the one Teams surface on every release. Its routes
 * are URL fragments (`#topics/<topic>`, `#teams/<topic>/<team>`), and the
 * anchors are the structural classes its scripts key off; labels ("Create a
 * new team", "Leave team", "Join team", "Add a Post") are localized.
 */
export const TEAMS_SELECTORS = {
  /** The "Browse" tab's topic cards. */
  topicCard: 'li.topic-card',
  /** "Create a new team in this topic" on a topic's page. */
  createTeam: 'a.create-team',
  /** The create-team form's name and description fields, and its submit. */
  teamName: '#u-field-input-name',
  teamDescription: '#u-field-textarea-description',
  formSubmit: 'button.action-primary',
  /**
   * The confirmation the page raises before leaving ("Leave this team?"): a
   * dialog whose primary action ("Confirm") is its first button.
   */
  confirmPrompt: '[role="dialog"] nav button',
  /** On a team's page: "Leave team", and "Join team" for a non-member. */
  leaveTeam: 'button.leave-team-link',
  joinTeam: 'button.action.action-primary',
  /** The team's own discussion, keyed by its topic id. */
  discussion: '.discussion-module[data-discussion-id]',
  /** The discussion's "Add a Post", its title and body fields and its submit. */
  newPost: '.discussion-module button.new-post-btn',
  postTitle: '.discussion-module .new-post-article input.js-post-title',
  postBody: '.discussion-module .new-post-article textarea.wmd-input',
  postSubmit: '.discussion-module .new-post-article button.submit',
} as const;

/** The link opening one topic from its card. */
export function teamsTopicLink(topicId: string): string {
  return `${TEAMS_SELECTORS.topicCard} a.action-view[href="#topics/${topicId}"]`;
}

/** A thread listed in the team's discussion. */
export function teamThread(threadId: string): string {
  return `${TEAMS_SELECTORS.discussion} [data-id="${threadId}"]`;
}
