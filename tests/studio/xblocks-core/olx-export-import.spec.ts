/*
 * OLX export → import of every xblocks-core block (regression plan B1.6–8).
 *
 * Each block's OLX reading and writing now runs through the relocated
 * `xblocks_core.legacy_utils.xml_utils` (`LegacyXmlMixin`, pointer tags), so a
 * course round trip is where a packaging or import-path mistake would show.
 * Steps:
 *
 *  1. As the Studio author, add a unit to the worker course holding one block of
 *     each type, each with a distinctive field (html/problem/annotatable `data`;
 *     metadata for the rest).
 *  2. Export the course to an OLX tarball (Studio export API) and download it.
 *  3. Create a fresh course and import the tarball into it through the Studio
 *     Import page; wait for the import task to succeed.
 *  4. For each block, read the imported copy (same block id, new course) and
 *     assert it exists with its category and its distinctive field intact.
 */
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS, getRunId } from '../../../src/config';
import {
  buildSection,
  createCourse,
  createXBlock,
  downloadCourseExport,
  fetchXBlock,
  newCourseIdentity,
  startCourseExport,
  updateXBlock,
  waitForCourseExport,
  waitForCourseImport,
} from '../../../src/api';
import { label } from '../library/helpers';
import { ROUND_TRIP_TAGS } from './round-trip';

/** One block per xblocks-core type, and what must survive the round trip. */
const BLOCKS = (marker: string) =>
  [
    { category: 'html', data: `<p>${marker} html</p>`, expectData: `${marker} html` },
    {
      category: 'problem',
      data:
        `<problem><multiplechoiceresponse><label>${marker} problem</label>` +
        `<choicegroup type="MultipleChoice"><choice correct="true">Yes</choice>` +
        `<choice correct="false">No</choice></choicegroup></multiplechoiceresponse></problem>`,
      expectData: `${marker} problem`,
    },
    {
      category: 'annotatable',
      data:
        `<annotatable><instructions><p>${marker} annotatable</p></instructions>` +
        `<p><annotation title="T" body="B">x</annotation></p></annotatable>`,
      expectData: `${marker} annotatable`,
    },
    {
      category: 'video',
      metadata: { youtube_id_1_0: '', html5_sources: [`https://example.org/${marker}.mp4`] },
    },
    { category: 'word_cloud', metadata: { num_inputs: 3, num_top_words: 7 } },
    { category: 'lti', metadata: { lti_id: 'e2e', launch_url: `https://example.org/${marker}` } },
    { category: 'discussion', metadata: { discussion_category: marker, discussion_target: 'OLX' } },
    {
      // A poll needs a question and answers: an empty one does not survive the
      // round trip (its OLX parser requires an <answer>).
      category: 'poll_question',
      metadata: {},
      fields: { question: `<p>${marker} poll</p>`, answers: [{ id: 'yes', text: 'Yes' }] },
    },
    { category: 'pdf', metadata: {} },
  ] as const;

test.describe('xblocks-core: OLX export and import', { tag: [...ROUND_TRIP_TAGS] }, () => {
  // Export and import each run on the CMS worker under TIMEOUTS.courseTransfer.
  test.describe.configure({ timeout: TIMEOUTS.contentTest * 2 });

  test('every core block survives export and import into a new course', async ({
    page,
    config,
    studioAuthorSession,
    resyncStudioAuthor,
    contentCourse,
    importPage,
  }, testInfo) => {
    void studioAuthorSession;
    await resyncStudioAuthor();
    const api = page.request;
    const { courseKey } = contentCourse;
    const marker = `E2E-${testInfo.testId.slice(-8)}`;
    const blocks = BLOCKS(marker);

    // 1. One block of each type in a new unit.
    const section = await buildSection(api, config, courseKey, label('olx', testInfo.testId), {
      subsections: [{ units: [{ blocks: [] }] }],
    });
    const unitKey = section.units[0]?.usageKey ?? '';
    const authored: { key: string; name: string; spec: (typeof blocks)[number] }[] = [];
    for (const spec of blocks) {
      const name = `${marker} ${spec.category}`;
      const key = await createXBlock(api, config, {
        parentLocator: unitKey,
        category: spec.category,
        displayName: name,
      });
      await updateXBlock(api, config, key, {
        ...('data' in spec ? { data: spec.data } : {}),
        ...('fields' in spec ? { fields: spec.fields } : {}),
        metadata: { display_name: name, ...('metadata' in spec ? spec.metadata : {}) },
      });
      authored.push({ key, name, spec });
    }

    // 2. Export.
    await startCourseExport(api, config, courseKey);
    const { outputPath } = await waitForCourseExport(api, config, courseKey);
    const tarball = await downloadCourseExport(api, config, outputPath);

    // 3. Import into a fresh course.
    const target = await createCourse(
      api,
      config,
      newCourseIdentity(config, getRunId(), testInfo.testId.slice(-6), 'olx import'),
    );
    const fileName = `e2e-olx-${Date.now().toString(36)}.tar.gz`;
    await importPage.goto(target);
    await importPage.uploadArchive(fileName, tarball);
    await waitForCourseImport(api, config, target, fileName);

    // 4. Each block arrives with its category and distinctive field.
    const from = courseKey.replace(/^course-v1:/, 'block-v1:');
    const to = target.replace(/^course-v1:/, 'block-v1:');
    for (const { key, name, spec } of authored) {
      const copy = await fetchXBlock(api, config, key.replace(from, to));
      expect(copy.category, key).toBe(spec.category);
      expect(copy.metadata, key).toMatchObject({
        display_name: name,
        ...('metadata' in spec ? spec.metadata : {}),
      });
      // `expectData` only for the blocks whose content lives in `data`; '' always matches.
      expect(copy.data ?? '', key).toContain('expectData' in spec ? spec.expectData : '');
    }
  });
});
