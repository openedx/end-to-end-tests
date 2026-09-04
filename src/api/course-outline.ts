import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';

/** Public Blocks API — the portable way to enumerate course structure. */
export const COURSE_BLOCKS_PATH = '/api/courses/v1/blocks/';

/** Sequence metadata the learning MFE loads for every subsection it opens. */
export const COURSEWARE_SEQUENCE_PATH = '/api/courseware/sequence/';

/**
 * Fields we ask the Blocks API for. `completion` is the numeric per-block
 * completion signal (0..1); it is the non-localized counterpart to the course
 * home outline's per-chapter/per-sequential `complete` booleans, which do not go
 * down to the vertical level.
 */
const REQUESTED_FIELDS = 'children,display_name,type,completion';

/** One block as returned by the Blocks API, narrowed to the fields we request. */
export interface CourseBlock {
  readonly id: string;
  readonly type: string;
  readonly display_name?: string;
  readonly children?: readonly string[];
  readonly completion?: number;
}

interface BlocksResponse {
  readonly root: string;
  readonly blocks: Record<string, CourseBlock>;
}

/**
 * A vertical (what the UI calls a "unit"), carrying the ancestry the courseware
 * URL needs and the child block types that decide how it is completed.
 *
 * Keyed by **block ID, never by index**: a course's unit count and order differ
 * per installation — the demo course alone varies between installs — so an
 * index-keyed map is wrong on any target but the one it was recorded against.
 */
export interface CourseUnit {
  readonly chapterId: string;
  readonly sequentialId: string;
  readonly id: string;
  readonly displayName?: string;
  /** Direct child block types, in order (e.g. `['html', 'problem', 'video']`). */
  readonly childTypes: readonly string[];
  /** Direct child block IDs, in order. */
  readonly childIds: readonly string[];
}

/** The course structure the suite navigates, flattened into ordered units. */
export interface CourseOutline {
  readonly courseKey: string;
  readonly rootId: string;
  readonly chapterIds: readonly string[];
  readonly sequentialIds: readonly string[];
  /** Every vertical in the course, in outline order. */
  readonly units: readonly CourseUnit[];
  /** Every block by ID, for callers that need more than the unit list. */
  readonly blocks: Readonly<Record<string, CourseBlock>>;
}

/** Units containing at least one block of the given type. */
export function unitsContaining(outline: CourseOutline, blockType: string): readonly CourseUnit[] {
  return outline.units.filter((unit) => unit.childTypes.includes(blockType));
}

/**
 * Renders one subsection for the learner through the API before the browser does.
 *
 * Workaround for an upstream race. The first time a block is rendered for a
 * (user, course) pair the LMS inserts the learner's `AnonymousUserId` row with a
 * plain `create()` inside an atomic request; when the learning MFE opens a unit
 * it fires several block-rendering requests at once for a brand-new learner, two
 * of them race the insert, and the loser turns its `IntegrityError` into a 500
 * (`TransactionManagementError`, since the atomic block is already broken). The
 * MFE then shows "There was an error loading this course" and every unit
 * navigation in the test fails. One serialized render here creates the row, so
 * the browser's parallel requests only ever read it.
 *
 * The response is not inspected: any answer means the render ran. A failure here
 * would surface again, with a better message, on the outline fetch that follows.
 */
export async function primeCoursewareForLearner(
  request: APIRequestContext,
  config: AppConfig,
  sequentialId: string,
): Promise<void> {
  await request.get(
    `${config.baseUrls.lms}${COURSEWARE_SEQUENCE_PATH}${encodeURIComponent(sequentialId)}`,
  );
}

/**
 * Fetches the course structure for `username` and flattens it to an ordered unit
 * list.
 *
 * The username matters: the Blocks API returns per-user completion and only the
 * blocks that user may see, so this must be the learner under test rather than an
 * anonymous or staff view.
 *
 * @throws {ApiError} when the course is missing, not visible to the user, or the
 * response is not the expected shape.
 */
export async function fetchCourseOutline(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  username: string,
): Promise<CourseOutline> {
  const url =
    `${config.baseUrls.lms}${COURSE_BLOCKS_PATH}?course_id=${encodeURIComponent(courseKey)}` +
    `&username=${encodeURIComponent(username)}&depth=all&requested_fields=${REQUESTED_FIELDS}`;
  const response = await request.get(url);

  if (!response.ok()) {
    throw new ApiError(
      `Could not read the structure of "${courseKey}" as "${username}" ` +
        `(HTTP ${response.status()}).`,
      { status: response.status(), url, body: await response.text() },
    );
  }

  const body = (await response.json()) as Partial<BlocksResponse>;
  if (typeof body.root !== 'string' || typeof body.blocks !== 'object' || body.blocks === null) {
    throw new ApiError(`Blocks API returned an unexpected shape for "${courseKey}".`, {
      status: response.status(),
      url,
      body: JSON.stringify(body).slice(0, 500),
    });
  }

  return buildOutline(courseKey, body.root, body.blocks);
}

/**
 * Depth-first walk of `course → chapter → sequential → vertical`, preserving
 * outline order.
 *
 * Nesting is matched on block **type** rather than on depth, because the
 * platform permits deeper trees than the classic four levels and a
 * depth-counting walk would silently skip units on such a course.
 */
export function buildOutline(
  courseKey: string,
  rootId: string,
  blocks: Record<string, CourseBlock>,
): CourseOutline {
  const chapterIds: string[] = [];
  const sequentialIds: string[] = [];
  const units: CourseUnit[] = [];

  const childrenOf = (id: string): readonly string[] => blocks[id]?.children ?? [];

  const visit = (id: string, chapterId?: string, sequentialId?: string): void => {
    const block = blocks[id];
    if (!block) {
      return;
    }

    let chapter = chapterId;
    let sequential = sequentialId;

    if (block.type === 'chapter') {
      chapter = id;
      chapterIds.push(id);
    } else if (block.type === 'sequential') {
      sequential = id;
      sequentialIds.push(id);
    } else if (block.type === 'vertical' && chapter !== undefined && sequential !== undefined) {
      const childIds = childrenOf(id);
      units.push({
        chapterId: chapter,
        sequentialId: sequential,
        id,
        displayName: block.display_name,
        childIds,
        childTypes: childIds.map((childId) => blocks[childId]?.type ?? 'unknown'),
      });
      // Leaf for our purposes: blocks inside a unit are handled by the unit page.
      return;
    }

    for (const childId of childrenOf(id)) {
      visit(childId, chapter, sequential);
    }
  };

  visit(rootId);

  return { courseKey, rootId, chapterIds, sequentialIds, units, blocks };
}
