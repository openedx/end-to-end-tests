import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { studioJson, studioOrigin } from './studio-origin';

/**
 * The Course Optimizer's link check, as Studio reports it. The check is a Celery
 * task on the CMS worker (`check_broken_links`) that requests every link in the
 * course's **published** content, course updates, handouts and custom pages, and
 * keeps the ones that fail. This is the platform's own reading of the latest
 * check the caller may see, so a spec reads the outcome here rather than from the
 * page.
 *
 * The path is the first REST generation's (`v0`, Teak onward); a later generation
 * may serve the same reading elsewhere, but this one stays for the MFE releases
 * that read it.
 */
export const LINK_CHECK_STATUS_PATH = '/api/contentstore/v0/link_check_status';

/** The task states, plus `Uninitiated` for a course never checked. */
export type LinkCheckStatus =
  'Uninitiated' | 'Pending' | 'In Progress' | 'Succeeded' | 'Failed' | 'Canceled' | 'Retrying';

/** The links one component was flagged for, by kind. */
export interface LinkCheckBlock {
  readonly id: string;
  readonly brokenLinks: readonly string[];
  readonly lockedLinks: readonly string[];
  readonly externalForbiddenLinks: readonly string[];
}

/** A finished check's findings in the course content, by section (usage key). */
export interface LinkCheckSection {
  readonly id: string;
  /** Every flagged component in the section, flattened out of its subsections and units. */
  readonly blocks: readonly LinkCheckBlock[];
}

export interface LinkCheckState {
  readonly status: LinkCheckStatus;
  /** When the latest check was queued; absent before the first. */
  readonly createdAt?: string;
  /** The findings, present once the latest check succeeded. */
  readonly sections: readonly LinkCheckSection[];
}

interface RawBlock {
  readonly id?: string;
  readonly brokenLinks?: readonly string[];
  readonly lockedLinks?: readonly string[];
  readonly externalForbiddenLinks?: readonly string[];
}

interface RawLinkCheckState {
  readonly LinkCheckStatus?: string;
  readonly LinkCheckCreatedAt?: string;
  readonly LinkCheckOutput?: {
    readonly sections?: readonly {
      readonly id?: string;
      readonly subsections?: readonly {
        readonly units?: readonly { readonly blocks?: readonly RawBlock[] }[];
      }[];
    }[];
  };
}

/** Reads the latest link check of `courseKey` the caller may see. */
export async function fetchLinkCheck(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<LinkCheckState> {
  const response = await request.get(
    `${studioOrigin(config)}${LINK_CHECK_STATUS_PATH}/${courseKey}`,
  );
  const raw = await studioJson<RawLinkCheckState>(
    response,
    `Reading the link check of ${courseKey}`,
  );
  return {
    status: (raw.LinkCheckStatus ?? 'Uninitiated') as LinkCheckStatus,
    createdAt: raw.LinkCheckCreatedAt,
    sections: (raw.LinkCheckOutput?.sections ?? []).map((section) => ({
      id: section.id ?? '',
      blocks: (section.subsections ?? []).flatMap((subsection) =>
        (subsection.units ?? []).flatMap((unit) =>
          (unit.blocks ?? []).map((block) => ({
            id: block.id ?? '',
            brokenLinks: block.brokenLinks ?? [],
            lockedLinks: block.lockedLinks ?? [],
            externalForbiddenLinks: block.externalForbiddenLinks ?? [],
          })),
        ),
      ),
    })),
  };
}
