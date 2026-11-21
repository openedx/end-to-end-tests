/*
 * Studio- and library-side integration of the xblocks-core blocks: the parts
 * that depend on the package being installed in the platform (component
 * templates, the CMS and Learning Core runtimes' asset URLs, a block's own
 * `studio_view` assets, templates found through the Django app registration).
 * Each test authors via the API, then checks what a Studio author sees:
 *
 * - Text templates: a unit's "Add component" data lists the Text variants that
 *   `src/xblock_html/templates/html/*.yaml` provide.
 * - Video (studio / library): an HTML5-only video (source stubbed) in the Studio
 *   unit preview and in the library preview; `video-xblock.js` (the webpack
 *   bundle) initializes the player.
 * - Annotatable editor: Edit opens the block's own `studio_view`
 *   (`annotatable_editor.js` + CodeMirror); changing the XML and saving
 *   persists it.
 * - Discussion placeholder: the Studio preview renders the block's Studio
 *   template (`_discussion_inline_studio.html`, found via the discussion app).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import {
  buildSection,
  createLibrary,
  createLibraryBlock,
  createXBlock,
  fetchContainer,
  fetchXBlock,
  newLibrarySlug,
  setLibraryBlockOlx,
  studioOrigin,
  updateXBlock,
} from '../../../src/api';
import { label } from '../library/helpers';
import { ROUND_TRIP_TAGS, xml } from './round-trip';

const CLIP = readFileSync(path.join(__dirname, '../../../src/fixtures/assets/short-clip.webm'));

/** A new section > subsection > unit in `courseKey` holding one `category` block. */
async function unitWith(
  page: Page,
  config: AppConfig,
  courseKey: string,
  name: string,
  category: string,
  fields: { metadata?: Record<string, unknown>; data?: string } = {},
): Promise<{ unitKey: string; blockKey: string }> {
  const section = await buildSection(page.request, config, courseKey, name, {
    subsections: [{ units: [{ blocks: [] }] }],
  });
  const unitKey = section.units[0]?.usageKey ?? '';
  const blockKey = await createXBlock(page.request, config, {
    parentLocator: unitKey,
    category,
    displayName: name,
  });
  await updateXBlock(page.request, config, blockKey, {
    ...fields,
    metadata: { display_name: name, ...fields.metadata },
  });
  return { unitKey, blockKey };
}

/** Serves the stubbed clip for `source`, ignoring the player's cache-busting query. */
const stubVideo = (page: Page, source: string) =>
  page.route(
    (url) => `${url.origin}${url.pathname}` === source,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'video/webm',
        body: CLIP,
        headers: { 'Accept-Ranges': 'none' },
      }),
  );

/** The Text variants xblocks-core ships (`src/xblock_html/templates/html/*.yaml`). */
const HTML_TEMPLATES = ['announcement', 'anon_user_id', 'iframe', 'raw', 'zooming_image'];

test.describe('xblocks-core: Studio and library integration', { tag: [...ROUND_TRIP_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('Text: the Add component data lists the packaged templates', async ({
    page,
    config,
    studioAuthorSession,
    resyncStudioAuthor,
    contentCourse,
  }, testInfo) => {
    void studioAuthorSession;
    await resyncStudioAuthor();
    const name = label('html templates', testInfo.testId);
    const { unitKey } = await unitWith(page, config, contentCourse.courseKey, name, 'html');
    const container = await fetchContainer(page.request, config, unitKey);
    const html = container.component_templates.find((t) => t.type === 'html');
    const boilerplates = (html?.templates ?? []).map((t) =>
      (t.boilerplate_name ?? '').replace(/\.yaml$/, ''),
    );
    expect(boilerplates).toEqual(expect.arrayContaining(HTML_TEMPLATES));
  });

  test('Video: the player initializes in the Studio unit preview', async ({
    page,
    config,
    studioAuthorSession,
    resyncStudioAuthor,
    contentCourse,
    studioUnitPage,
  }, testInfo) => {
    void studioAuthorSession;
    await resyncStudioAuthor();
    const name = label('video studio', testInfo.testId);
    const source = `https://example.org/e2e-${testInfo.testId}-studio.mp4`;
    const { unitKey, blockKey } = await unitWith(
      page,
      config,
      contentCourse.courseKey,
      name,
      'video',
      { metadata: { youtube_id_1_0: '', html5_sources: [source] } },
    );
    await stubVideo(page, source);
    await studioUnitPage.goto(unitKey);
    await expect(studioUnitPage.component(blockKey).locator('.video')).toHaveClass(
      /\bis-initialized\b/,
      { timeout: TIMEOUTS.navigation },
    );
  });

  test('Video: the player initializes in the library preview', async ({
    page,
    config,
    studioAuthorSession,
  }, testInfo) => {
    void studioAuthorSession;
    const name = label('video library', testInfo.testId);
    const source = `https://example.org/e2e-${testInfo.testId}-library.mp4`;
    const library = await createLibrary(page.request, config, {
      org: config.org ?? 'OpenedX',
      slug: newLibrarySlug('video'),
      title: name,
    });
    const block = await createLibraryBlock(page.request, config, library.id, {
      blockType: 'video',
    });
    await setLibraryBlockOlx(
      page.request,
      config,
      block.id,
      `<video display_name="${xml(name)}" youtube_id_1_0=""><source src="${source}"/></video>`,
    );
    await stubVideo(page, source);
    // The document the library sidebar's Preview tab frames (Learning Core runtime).
    await page.goto(`${studioOrigin(config)}/xblocks/v2/${block.id}/embed/student_view/`);
    await expect(page.locator('.video')).toHaveClass(/\bis-initialized\b/, {
      timeout: TIMEOUTS.navigation,
    });
  });

  test('Annotatable: its own Studio editor opens and saves', async ({
    page,
    config,
    studioAuthorSession,
    resyncStudioAuthor,
    contentCourse,
    studioUnitPage,
  }, testInfo) => {
    void studioAuthorSession;
    await resyncStudioAuthor();
    const name = label('annotatable editor', testInfo.testId);
    const before = `E2E before ${testInfo.testId.slice(-6)}`;
    const after = `E2E after ${testInfo.testId.slice(-6)}`;
    const olx = (text: string) =>
      `<annotatable><instructions><p>${text}</p></instructions>` +
      `<p><annotation title="T" body="B">x</annotation></p></annotatable>`;
    const { unitKey, blockKey } = await unitWith(
      page,
      config,
      contentCourse.courseKey,
      name,
      'annotatable',
      { data: olx(before) },
    );

    await studioUnitPage.goto(unitKey);
    const frame = await studioUnitPage.openLegacyEditor(blockKey);
    // annotatable_editor.js turns the textarea into a CodeMirror editor.
    await frame.locator('.CodeMirror').waitFor({ timeout: TIMEOUTS.navigation });
    await frame.evaluate((value) => {
      const cm = document.querySelector<
        Element & { CodeMirror: { setValue: (v: string) => void } }
      >('.CodeMirror');
      cm?.CodeMirror.setValue(value);
    }, olx(after));
    const saved = await studioUnitPage.saveLegacyEditor(frame, '.save-button', {
      handler: 'submit_studio_edits',
    });
    expect(saved.ok()).toBe(true);
    expect((await fetchXBlock(page.request, config, blockKey)).data).toContain(after);
  });

  test('Discussion: the Studio preview renders its placeholder', async ({
    page,
    config,
    studioAuthorSession,
    resyncStudioAuthor,
    contentCourse,
    studioUnitPage,
  }, testInfo) => {
    void studioAuthorSession;
    await resyncStudioAuthor();
    const name = label('discussion studio', testInfo.testId);
    const { unitKey, blockKey } = await unitWith(
      page,
      config,
      contentCourse.courseKey,
      name,
      'discussion',
      { metadata: { discussion_category: 'E2E', discussion_target: 'Studio' } },
    );
    await studioUnitPage.goto(unitKey);
    const module = studioUnitPage.component(blockKey).locator('.discussion-module');
    await expect(module).toBeVisible();
    await expect(module.locator('.discussion-preview')).toBeVisible();
  });
});
