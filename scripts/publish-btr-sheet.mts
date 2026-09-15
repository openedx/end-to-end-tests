#!/usr/bin/env node
/**
 * Publishes one run's `test-results/btr-run.json` to a per-release BTR results
 * spreadsheet: bootstraps an empty sheet, overwrites `Latest` (when allowed), adds
 * a timestamped run tab and appends a `Runs` row. Runs natively on Node 24
 * (type stripping); no build step.
 *
 *   node scripts/publish-btr-sheet.mts --release verawood --sheet <url> \
 *     [--from test-results/btr-run.json] [--update-latest true|false] \
 *     [--environment <github-environment>]
 *
 * Credentials: a service-account JSON key in `BTR_SHEET_CREDENTIALS` (the secret's
 * text) or a path in `BTR_SHEET_CREDENTIALS_FILE`. The spreadsheet must be shared
 * with the key's `client_email` as an Editor.
 *
 * Policy: run from CI on `schedule` / `workflow_dispatch` only, never on PR/push;
 * locally only against a throwaway sheet (see `src/reporting/README.md`).
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import type { BtrRun } from '../src/reporting/btr-run.ts';
import {
  SheetsClient,
  mintAccessToken,
  parseServiceAccountKey,
  parseSpreadsheetId,
} from './btr-sheet/google.mts';
import {
  LATEST_TAB,
  META_TAB,
  PlanRefusal,
  planPublish,
  type SpreadsheetState,
} from './btr-sheet/plan.mts';

const PUBLISHER = 'openedx/end-to-end-tests publish-btr-sheet v1';

function fail(message: string): never {
  console.error(`::error::${message}`);
  process.exit(1);
}

function parseBool(value: string, flag: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fail(`${flag} must be 'true' or 'false', got '${value}'.`);
}

function loadCredentials(env: NodeJS.ProcessEnv): string {
  if (env.BTR_SHEET_CREDENTIALS) {
    return env.BTR_SHEET_CREDENTIALS;
  }
  if (env.BTR_SHEET_CREDENTIALS_FILE) {
    return readFileSync(env.BTR_SHEET_CREDENTIALS_FILE, 'utf8');
  }
  return fail(
    'No credentials: set BTR_SHEET_CREDENTIALS (service-account JSON) or BTR_SHEET_CREDENTIALS_FILE.',
  );
}

function loadRun(path: string): BtrRun {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return fail(`Run report '${path}' not found; did the suite run with the btr-run reporter?`);
  }
  const run = JSON.parse(text) as BtrRun;
  if (run.schemaVersion !== 1) {
    return fail(
      `Run report schema ${String(run.schemaVersion)} is not supported by this publisher.`,
    );
  }
  return run;
}

async function main(): Promise<void> {
  const { values: args } = parseArgs({
    options: {
      release: { type: 'string' },
      sheet: { type: 'string' },
      from: { type: 'string', default: 'test-results/btr-run.json' },
      'update-latest': { type: 'string', default: 'true' },
      environment: { type: 'string', default: '' },
    },
  });
  if (!args.release) fail('--release is required (e.g. --release verawood).');
  if (!args.sheet) fail('--sheet is required (the spreadsheet URL).');
  const release = args.release;
  const spreadsheetId = parseSpreadsheetId(args.sheet);
  const updateLatest = parseBool(args['update-latest'], '--update-latest');
  const run = loadRun(args.from);
  const ctx = { release, environment: args.environment || undefined };

  const key = parseServiceAccountKey(loadCredentials(process.env));
  const token = await mintAccessToken(key);
  const sheets = new SheetsClient(token, spreadsheetId, { clientEmail: key.client_email });

  // Observe before planning: tabs, `_meta`, and whether the default tab is empty.
  const resource = await sheets.get();
  const tabs = (resource.sheets ?? []).map((s) => ({
    sheetId: s.properties?.sheetId ?? 0,
    title: s.properties?.title ?? '',
    index: s.properties?.index ?? 0,
  }));
  const hasLatest = tabs.some((t) => t.title === LATEST_TAB);
  const hasMeta = tabs.some((t) => t.title === META_TAB);
  const state: SpreadsheetState = {
    title: resource.properties?.title ?? '',
    sheets: tabs,
    meta: hasMeta ? await sheets.valuesGet(`'${META_TAB}'!A1:B20`) : undefined,
    defaultSheetHasValues:
      !hasLatest && tabs.length === 1 && tabs[0]
        ? ((await sheets.valuesGet(`'${tabs[0].title}'!A1:Z50`)) ?? []).length > 0
        : undefined,
  };

  let plan;
  try {
    plan = planPublish({
      state,
      run,
      ctx,
      updateLatest,
      now: new Date().toISOString(),
      publisher: PUBLISHER,
    });
  } catch (error) {
    if (error instanceof PlanRefusal) {
      return fail(error.message);
    }
    throw error;
  }

  await sheets.batchUpdate(plan.structure);
  for (const range of plan.clear) {
    await sheets.valuesClear(range);
  }
  await sheets.valuesBatchUpdate(plan.writes);
  await sheets.valuesAppend(plan.append.range, plan.append.values);
  await sheets.batchUpdate(plan.finish);

  const tabUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${plan.runTab.sheetId}`;
  const what = [
    plan.bootstrapping ? 'bootstrapped the spreadsheet' : '',
    `added tab '${plan.runTab.title}'`,
    plan.updateLatest
      ? `updated '${LATEST_TAB}'`
      : `left '${LATEST_TAB}' unchanged (filtered or off-branch run)`,
  ]
    .filter(Boolean)
    .join(', ');
  console.log(`::notice::BTR results for ${release}: ${what}. ${tabUrl}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### BTR results sheet\n\n- Release **${release}**: ${what}.\n- [Open the run tab](${tabUrl})\n\n`,
    );
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `tab_url=${tabUrl}\n`);
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
