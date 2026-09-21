import type { APIRequestContext } from '@playwright/test';

import { pollUntil, type PollOutcome } from './poll';
import { TIMEOUTS, type AppConfig, type LibraryContainerType } from '../config';
import {
  addCollectionItems,
  addContainerChildren,
  commitLibrary,
  createCollection,
  createLibrary,
  createLibraryBlock,
  createLibraryContainer,
  fetchDownstream,
  fetchMigration,
  isMigrationSettled,
  libraryOlx,
  newLibrarySlug,
  setLibraryBlockOlx,
  SAMPLE_YOUTUBE_ID,
  type ContentLibrary,
  type CourseOutline,
  type DownstreamLink,
  type LibraryBlock,
  type LibraryCollection,
  type LibraryContainer,
  type MigrationTask,
} from '../api';

/**
 * Content-library flows that span the library API, the course API and the
 * learner's readings: authoring a whole library in one call (the analogue of
 * `buildSection`), importing library content into a course, and the bounded
 * waits for the platform's asynchronous parts (an update becoming available,
 * a migration settling, a learner seeing a block). Every wait polls under a
 * named budget and **returns what it last observed** instead of throwing, so a
 * spec's failure message can show the readings (`PLAT-009`'s lesson).
 */

// --- authoring a library -------------------------------------------------------

/** A component to author: its type, title and (for text / pdf) content. */
export interface LibraryBlockSpec {
  readonly type: 'html' | 'problem' | 'video' | 'pdf';
  /** Its display name — the test's own data, safe to match in the UI. */
  readonly displayName: string;
  /** Text-block body, pdf URL; ignored for other types. */
  readonly content?: string;
}

export interface LibraryShape {
  readonly org: string;
  /** Defaults to a run-unique slug. */
  readonly slug?: string;
  readonly title: string;
  /** Components, by a key the containers and collections refer to. */
  readonly blocks?: Readonly<Record<string, LibraryBlockSpec>>;
  /** Units, each listing the block keys it holds, in order. */
  readonly units?: Readonly<Record<string, { displayName: string; blocks: readonly string[] }>>;
  /** Subsections, each listing the unit keys it holds. */
  readonly subsections?: Readonly<
    Record<string, { displayName: string; units: readonly string[] }>
  >;
  /** Sections, each listing the subsection keys it holds. */
  readonly sections?: Readonly<
    Record<string, { displayName: string; subsections: readonly string[] }>
  >;
  /** Collections, each listing block / container keys. */
  readonly collections?: Readonly<Record<string, { title: string; items: readonly string[] }>>;
  /** Publish everything at the end (default `true`). */
  readonly publish?: boolean;
  /** Set `allow_public_read` so any course creator may reuse the library (default `false`). */
  readonly allowPublicRead?: boolean;
}

export interface AuthoredLibrary {
  readonly library: ContentLibrary;
  readonly libraryKey: string;
  readonly blocks: Readonly<Record<string, LibraryBlock>>;
  readonly units: Readonly<Record<string, LibraryContainer>>;
  readonly subsections: Readonly<Record<string, LibraryContainer>>;
  readonly sections: Readonly<Record<string, LibraryContainer>>;
  readonly collections: Readonly<Record<string, LibraryCollection>>;
}

/** The id of a shape key, or a clear error naming the dangling reference. */
function idOf(map: Readonly<Record<string, { id: string }>>, key: string, kind: string): string {
  const entry = map[key];
  if (entry === undefined) {
    throw new Error(`Library shape refers to an unknown ${kind} "${key}".`);
  }
  return entry.id;
}

function olxFor(spec: LibraryBlockSpec): string | undefined {
  switch (spec.type) {
    case 'html':
      return libraryOlx.html(spec.displayName, spec.content ?? spec.displayName);
    case 'video':
      return libraryOlx.video(spec.displayName, SAMPLE_YOUTUBE_ID);
    case 'pdf':
      return libraryOlx.pdf(spec.displayName, spec.content ?? '');
    case 'problem':
      return libraryOlx.problem(spec.displayName);
  }
}

/**
 * Creates a library and everything `shape` describes through the v2 API —
 * the arrange step of every library spec, so the body starts on the action
 * under test. Idempotent per slug is the fixture's concern; this always
 * creates.
 */
export async function authorLibrary(
  request: APIRequestContext,
  config: AppConfig,
  shape: LibraryShape,
): Promise<AuthoredLibrary> {
  const library = await createLibrary(request, config, {
    org: shape.org,
    slug: shape.slug ?? newLibrarySlug(),
    title: shape.title,
    allowPublicRead: shape.allowPublicRead ?? false,
  });
  const libraryKey = library.id;

  const blocks: Record<string, LibraryBlock> = {};
  for (const [key, spec] of Object.entries(shape.blocks ?? {})) {
    const block = await createLibraryBlock(request, config, libraryKey, { blockType: spec.type });
    const olx = olxFor(spec);
    if (olx !== undefined) {
      await setLibraryBlockOlx(request, config, block.id, olx);
    }
    blocks[key] = { ...block, display_name: spec.displayName };
  }

  const containers = async (
    type: LibraryContainerType,
    entries: Readonly<Record<string, { displayName: string; children: readonly string[] }>>,
    resolve: (key: string) => string,
  ) => {
    const out: Record<string, LibraryContainer> = {};
    for (const [key, spec] of Object.entries(entries)) {
      const container = await createLibraryContainer(
        request,
        config,
        libraryKey,
        type,
        spec.displayName,
      );
      if (spec.children.length > 0) {
        await addContainerChildren(request, config, container.id, spec.children.map(resolve));
      }
      out[key] = container;
    }
    return out;
  };
  const units = await containers(
    'unit',
    Object.fromEntries(
      Object.entries(shape.units ?? {}).map(([k, u]) => [
        k,
        { displayName: u.displayName, children: u.blocks },
      ]),
    ),
    (k) => idOf(blocks, k, 'block'),
  );
  const subsections = await containers(
    'subsection',
    Object.fromEntries(
      Object.entries(shape.subsections ?? {}).map(([k, s]) => [
        k,
        { displayName: s.displayName, children: s.units },
      ]),
    ),
    (k) => idOf(units, k, 'unit'),
  );
  const sections = await containers(
    'section',
    Object.fromEntries(
      Object.entries(shape.sections ?? {}).map(([k, s]) => [
        k,
        { displayName: s.displayName, children: s.subsections },
      ]),
    ),
    (k) => idOf(subsections, k, 'subsection'),
  );

  const all: Record<string, { id: string }> = { ...blocks, ...units, ...subsections, ...sections };
  const collections: Record<string, LibraryCollection> = {};
  for (const [key, spec] of Object.entries(shape.collections ?? {})) {
    const collection = await createCollection(request, config, libraryKey, spec.title);
    if (spec.items.length > 0) {
      await addCollectionItems(
        request,
        config,
        libraryKey,
        collection.key,
        spec.items.map((k) => idOf(all, k, 'item')),
      );
    }
    collections[key] = collection;
  }

  if (shape.publish ?? true) {
    await commitLibrary(request, config, libraryKey);
  }
  return { library, libraryKey, blocks, units, subsections, sections, collections };
}

/** Polls a course block's library link until the library has a newer published version for it. */
export async function waitForSyncAvailable(
  request: APIRequestContext,
  config: AppConfig,
  downstreamKey: string,
): Promise<PollOutcome<DownstreamLink>> {
  return pollUntil(
    () => fetchDownstream(request, config, downstreamKey),
    (link) => link.ready_to_sync,
    TIMEOUTS.librarySync,
  );
}

/** Polls a migration task until it settles (or is at least visible and finished). */
export async function waitForMigration(
  request: APIRequestContext,
  config: AppConfig,
  uuid: string,
): Promise<PollOutcome<MigrationTask | undefined>> {
  return pollUntil(
    () => fetchMigration(request, config, uuid),
    (task) => task !== undefined && isMigrationSettled(task),
    TIMEOUTS.libraryMigration,
  );
}

/**
 * Polls a learner's outline reading (`RoundTripLearner.outline`) until it lists
 * `usageKey` — the learner-side proof that a published course block, library-
 * sourced or not, reached the LMS. Under `contentPublish`, like every learner
 * reading after a publish.
 */
export async function waitForLearnerBlock(
  readOutline: () => Promise<CourseOutline>,
  usageKey: string,
): Promise<PollOutcome<readonly string[]>> {
  return pollUntil(
    async () => {
      const outline = await readOutline();
      return Object.keys(outline.blocks);
    },
    (ids) => ids.includes(usageKey),
    TIMEOUTS.contentPublish,
  );
}
