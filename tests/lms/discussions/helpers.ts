/**
 * Every forum spec runs in the `studio-author` project on the worker's
 * `contentCourse`: the author is the course instructor (who grants forum
 * roles), learners post on their own contexts. Gated on `discussions` (default
 * on; an install without the forum opts out) and on `studio`, which the worker
 * author needs.
 */
export const DISCUSSION_TAGS: string[] = ['@studio', '@author', '@discussions'];
