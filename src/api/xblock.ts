import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { STUDIO_JSON_ACCEPT, studioJson, studioOrigin, studioWrite } from './studio-origin';

/**
 * The legacy Studio xblock handler — the one endpoint the authoring MFE drives
 * the whole course outline and every unit through. Creating, editing, publishing,
 * duplicating, reordering and deleting blocks are all requests to it.
 */
export const XBLOCK_PATH = '/xblock/';

/** Read of one block's outline information (the author's view of its state). */
export const XBLOCK_OUTLINE_PATH = '/xblock/outline/';

/** The MFE's model of the whole course outline. */
export const COURSE_INDEX_PATH = '/api/contentstore/v1/course_index/';

/** The MFE's model of one unit page. */
export const CONTAINER_HANDLER_PATH = '/api/contentstore/v1/container_handler/';

/** The components inside one unit. */
export function containerChildrenPath(verticalUsageKey: string): string {
  return `/api/contentstore/v1/container/vertical/${verticalUsageKey}/children`;
}

/** Structural block types, plus the component types this suite authors. */
export type XBlockCategory =
  | 'chapter'
  | 'sequential'
  | 'vertical'
  | 'html'
  | 'problem'
  | 'video'
  | 'discussion'
  | (string & {});

/**
 * The author-side state of a block, as the outline card badge derives it:
 * `live` (published and released), `ready` (published, release date in the
 * future), `unscheduled` (no release date), `needs_attention` (unpublished
 * changes, or a published parent with unpublished children), `staff_only`
 * (hidden from learners), `gated` (behind a prerequisite).
 */
export type VisibilityState =
  'live' | 'ready' | 'unscheduled' | 'needs_attention' | 'staff_only' | 'gated';

/**
 * One block as `GET /xblock/outline/<key>` (and `course_index`) describes it,
 * narrowed to what the specs assert on. Depth stops at verticals: a unit's
 * components are read with {@link fetchContainerChildren}.
 */
export interface XBlockOutline {
  readonly id: string;
  readonly display_name: string;
  readonly category: string;
  readonly has_children: boolean;
  readonly published: boolean;
  readonly has_changes: boolean | null;
  readonly visibility_state: VisibilityState | null;
  /** Localized, for display only — assert on `start`. */
  readonly release_date: string | null;
  readonly released_to_students: boolean;
  /** ISO-8601 UTC release date the block inherits or sets. */
  readonly start: string | null;
  readonly graded: boolean;
  readonly format: string | null;
  readonly due: string | null;
  readonly visible_to_staff_only?: boolean;
  readonly has_explicit_staff_lock: boolean;
  readonly ancestor_has_staff_lock?: boolean;
  readonly group_access: Readonly<Record<string, readonly number[]>>;
  readonly is_prereq?: boolean;
  /** Subsections available as prerequisites, on a subsection. */
  readonly prereqs?: readonly { block_usage_key: string; block_display_name: string }[];
  /** The prerequisite this subsection requires, or `null`. */
  readonly prereq?: string | null;
  readonly prereq_min_score?: number | null;
  readonly prereq_min_completion?: number | null;
  readonly highlights?: readonly string[];
  readonly highlights_enabled_for_messaging?: boolean;
  readonly discussion_enabled?: boolean;
  readonly child_info?: {
    readonly category: string;
    readonly children: readonly XBlockOutline[];
  };
  readonly [field: string]: unknown;
}

/** `GET /xblock/<key>`: the outline information plus the block's content. */
export interface XBlockDetail extends XBlockOutline {
  /** OLX/HTML of a component; `null` for structural blocks. */
  readonly data: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** What every xblock write echoes back. */
export interface XBlockWriteResult {
  readonly id: string;
  readonly data: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** `GET course_index/<course>`, narrowed. */
export interface CourseIndex {
  readonly course_structure: XBlockOutline;
  readonly course_release_date: string;
  /** Present only for global staff on an install with courseware indexing on. */
  readonly reindex_link: string | null;
  readonly lms_link: string;
  readonly is_custom_relative_dates_active: boolean;
  readonly [field: string]: unknown;
}

/** One entry of the "Add component" bar, from `container_handler`. */
export interface ComponentTemplate {
  readonly type: string;
  readonly display_name: string;
  readonly templates: readonly {
    readonly display_name: string;
    readonly category: string;
    readonly boilerplate_name: string | null;
  }[];
}

/** `GET container_handler/<vertical>`, narrowed. */
export interface ContainerInfo {
  readonly position: number;
  readonly prev_url: string | null;
  readonly next_url: string | null;
  readonly ancestor_xblocks: readonly {
    readonly title: string;
    readonly is_last: boolean;
    readonly children: readonly { readonly display_name: string; readonly usage_key: string }[];
  }[];
  readonly component_templates: readonly ComponentTemplate[];
  readonly draft_preview_link: string;
  readonly published_preview_link: string;
  readonly xblock_info: XBlockOutline;
  readonly [field: string]: unknown;
}

/** One component of a unit, from the container children API. */
export interface ContainerChild {
  readonly block_id: string;
  readonly block_type: string;
  readonly name: string;
  readonly actions: Readonly<Record<string, boolean>>;
}

/**
 * The usage key of a course's root block. Every course-level xblock write
 * (highlights, course-wide metadata) and the outline read of the whole course
 * address this key rather than the course key.
 */
export function courseUsageKey(courseKey: string): string {
  const match = /^course-v1:(.+)$/.exec(courseKey);
  if (match === null) {
    throw new ApiError(`"${courseKey}" is not a course-v1 key.`, { status: 0, url: '', body: '' });
  }
  return `block-v1:${match[1]}+type@course+block@course`;
}

export interface CreateXBlockOptions {
  readonly parentLocator: string;
  readonly category: XBlockCategory;
  readonly displayName?: string;
  /**
   * A component template name (`raw.yaml`, `announcement.yaml`, …) or, as the
   * Text tile sends it, the bare type. Leaving it out creates the blank block
   * the Problem and Video tiles create before opening their editors.
   */
  readonly boilerplate?: string;
}

interface CreateXBlockResponse {
  readonly locator?: string;
  readonly courseKey?: string;
}

/**
 * Creates a block under `parentLocator` and returns its usage key.
 *
 * Structure is created the way the outline does it: chapters and sequentials come
 * back **published** (the platform publishes structure as it is created) while
 * verticals and components are **drafts** until {@link publishXBlock} — so a spec
 * about publishing always publishes a unit.
 */
export async function createXBlock(
  request: APIRequestContext,
  config: AppConfig,
  options: CreateXBlockOptions,
): Promise<string> {
  const body = await studioWrite<CreateXBlockResponse>(
    request,
    config,
    'POST',
    XBLOCK_PATH,
    `Creating a ${options.category} under ${options.parentLocator}`,
    {
      parent_locator: options.parentLocator,
      category: options.category,
      ...(options.displayName === undefined ? {} : { display_name: options.displayName }),
      ...(options.boilerplate === undefined ? {} : { boilerplate: options.boilerplate }),
    },
  );
  if (typeof body?.locator !== 'string') {
    throw new ApiError(`Studio created a ${options.category} but returned no locator.`, {
      status: 200,
      url: `${studioOrigin(config)}${XBLOCK_PATH}`,
      body: JSON.stringify(body),
    });
  }
  return body.locator;
}

/**
 * Metadata fields the suite writes. Anything the platform accepts passes
 * through; these are the ones the specs depend on, typed. `null` clears a field
 * back to its inherited value (`visible_to_staff_only: null` un-hides).
 */
export interface XBlockMetadata {
  readonly display_name?: string;
  /** ISO-8601 UTC release date. */
  readonly start?: string | null;
  readonly due?: string | null;
  readonly visible_to_staff_only?: boolean | null;
  readonly graded?: boolean;
  /** Assignment type name from the grading policy (`Homework`, …). */
  readonly format?: string | null;
  readonly group_access?: Readonly<Record<string, readonly number[]>>;
  readonly highlights?: readonly string[];
  readonly highlights_enabled_for_messaging?: boolean;
  readonly discussion_enabled?: boolean;
  readonly youtube_id_1_0?: string;
  readonly download_video?: boolean;
  readonly start_time?: string;
  readonly end_time?: string;
  readonly [field: string]: unknown;
}

export interface UpdateXBlockOptions {
  readonly metadata?: XBlockMetadata;
  /** OLX (problem) or HTML (text) content of a component. */
  readonly data?: string;
  /**
   * `make_public` publishes the block; `republish` publishes only if it was
   * already published (what the unit page's visibility toggle sends).
   */
  readonly publish?: 'make_public' | 'republish' | 'discard_changes';
}

/** Writes metadata and/or content to a block, optionally publishing in the same request. */
export async function updateXBlock(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
  options: UpdateXBlockOptions,
): Promise<XBlockWriteResult> {
  return studioWrite<XBlockWriteResult>(
    request,
    config,
    'PATCH',
    `${XBLOCK_PATH}${usageKey}`,
    `Updating ${usageKey}`,
    {
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
      ...(options.data === undefined ? {} : { data: options.data }),
      ...(options.publish === undefined ? {} : { publish: options.publish }),
    },
  );
}

/** Publishes a block and everything below it. */
export async function publishXBlock(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<void> {
  await updateXBlock(request, config, usageKey, { publish: 'make_public' });
}

/** The author's view of one block's state (and its children down to units). */
export async function fetchXBlockOutline(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<XBlockOutline> {
  const response = await request.get(`${studioOrigin(config)}${XBLOCK_OUTLINE_PATH}${usageKey}`, {
    headers: STUDIO_JSON_ACCEPT,
  });
  return studioJson<XBlockOutline>(response, `Reading the outline of ${usageKey}`);
}

/** One block with its `data` and `metadata` — what the editor specs assert on. */
export async function fetchXBlock(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<XBlockDetail> {
  const response = await request.get(`${studioOrigin(config)}${XBLOCK_PATH}${usageKey}`, {
    headers: STUDIO_JSON_ACCEPT,
  });
  return studioJson<XBlockDetail>(response, `Reading ${usageKey}`);
}

export async function fetchCourseIndex(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CourseIndex> {
  const response = await request.get(`${studioOrigin(config)}${COURSE_INDEX_PATH}${courseKey}`, {
    headers: STUDIO_JSON_ACCEPT,
  });
  return studioJson<CourseIndex>(response, `Reading the course index of ${courseKey}`);
}

export async function fetchContainer(
  request: APIRequestContext,
  config: AppConfig,
  verticalUsageKey: string,
): Promise<ContainerInfo> {
  const response = await request.get(
    `${studioOrigin(config)}${CONTAINER_HANDLER_PATH}${verticalUsageKey}`,
    { headers: STUDIO_JSON_ACCEPT },
  );
  return studioJson<ContainerInfo>(response, `Reading the unit page model of ${verticalUsageKey}`);
}

export async function fetchContainerChildren(
  request: APIRequestContext,
  config: AppConfig,
  verticalUsageKey: string,
): Promise<readonly ContainerChild[]> {
  const response = await request.get(
    `${studioOrigin(config)}${containerChildrenPath(verticalUsageKey)}`,
    { headers: STUDIO_JSON_ACCEPT },
  );
  const body = await studioJson<{ children: readonly ContainerChild[] }>(
    response,
    `Reading the components of ${verticalUsageKey}`,
  );
  return body.children;
}

/**
 * The block types this installation offers in the "Add component" bar, in the
 * order the tiles render. A spec gated on a component capability asserts its
 * type is listed here, so a target that declares a capability it lacks fails
 * instead of passing vacuously.
 */
export function availableComponentTypes(container: ContainerInfo): readonly string[] {
  return container.component_templates.map((template) => template.type);
}

/**
 * The block types available under the "Advanced" tile (`lti_consumer`, `pdf`,
 * `poll`, …) — installed advanced XBlocks the course may add.
 */
export function advancedComponentTypes(container: ContainerInfo): readonly string[] {
  const advanced = container.component_templates.find((template) => template.type === 'advanced');
  return advanced?.templates.map((template) => template.category) ?? [];
}
