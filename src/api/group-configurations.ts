import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { studioJson, studioOrigin, studioWriteHeaders } from './studio-origin';

/** Group Configurations, as the authoring MFE reads them. */
export const GROUP_CONFIGURATIONS_PATH = '/api/contentstore/v1/group_configurations';

/** Group Configurations writes (legacy Studio handler). */
export const GROUP_CONFIGURATIONS_WRITE_PATH = '/group_configurations';

export interface ContentGroup {
  readonly id: number;
  readonly name: string;
  readonly version: number;
}

/** A user partition: content groups (`cohort` scheme), enrollment tracks, … */
export interface GroupConfiguration {
  readonly id: number;
  readonly name: string;
  readonly scheme: string;
  readonly description: string;
  readonly groups: readonly ContentGroup[];
  readonly active: boolean;
  readonly version: number;
}

interface RawGroupConfigurations {
  readonly all_group_configurations?: readonly GroupConfiguration[];
  readonly experiment_group_configurations?: readonly GroupConfiguration[];
}

export async function fetchGroupConfigurations(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<readonly GroupConfiguration[]> {
  const response = await request.get(
    `${studioOrigin(config)}${GROUP_CONFIGURATIONS_PATH}/${courseKey}`,
  );
  const raw = await studioJson<RawGroupConfigurations>(
    response,
    `Reading group configurations of ${courseKey}`,
  );
  return [...(raw.all_group_configurations ?? []), ...(raw.experiment_group_configurations ?? [])];
}

/**
 * Creates a content-group configuration (`cohort` scheme) with the given group
 * names. Returns the configuration with the ids the platform assigned.
 */
export async function createContentGroups(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  groupNames: readonly string[],
  name = 'Content Groups',
): Promise<GroupConfiguration> {
  const headers = await studioWriteHeaders(request, config);
  const response = await request.post(
    `${studioOrigin(config)}${GROUP_CONFIGURATIONS_WRITE_PATH}/${courseKey}`,
    {
      data: {
        name,
        description: '',
        scheme: 'cohort',
        groups: groupNames.map((groupName) => ({ name: groupName, version: 1 })),
        version: 3,
      },
      headers,
    },
  );
  return studioJson<GroupConfiguration>(response, `Creating content groups in ${courseKey}`);
}
