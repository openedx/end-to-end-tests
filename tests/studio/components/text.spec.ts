import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  fetchContainer,
  fetchContainerChildren,
  fetchXBlock,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { buildUnit } from './component-helpers';

/**
 * Authoring a text component in the TinyMCE editor (TC-00217, and TC-00218's
 * "test the editor in detail").
 *
 * Formatting is applied the two ways the editor offers that do not depend on
 * copy: keyboard shortcuts (bold, italic, underline, a heading) and toolbar
 * buttons addressed by TinyMCE's own command names (alignment, a bullet list,
 * a quote, text colour and highlight, a link made and broken again, an
 * emoticon). The assertion is the saved OLX HTML; toolbar labels (localized)
 * are never matched. Images, tables, special characters and embedded iframes
 * are not driven here.
 *
 * The editor's Cancel is a second case: it asks first, "Keep Editing" returns
 * to the editor with the text intact, and "Discard Changes and Exit" closes it
 * without saving.
 */
/** The emoji picked from the emoticons dialog (its tile's value is the character). */
const EMOJI = '😀';

test.describe(
  'Studio text component',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'authors formatted text in the editor from shortcuts and the toolbar',
      { tag: '@smoke', annotation: [testId('TC-00217'), testId('TC-00218')] },
      async ({
        page,
        config,
        studioUnitPage,
        studioTextEditor,
        authoringCourse,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const unitKey = await buildUnit(page.request, config, authoringCourse.courseKey, {
          label: 'text',
        });

        await studioUnitPage.goto(unitKey);
        const types = availableComponentTypes(await fetchContainer(page.request, config, unitKey));
        await studioUnitPage.openAddComponent(types.indexOf('html'));
        await studioTextEditor.chooseTemplate('html');

        await studioTextEditor.type('E2E plain ');
        await studioTextEditor.bold();
        await studioTextEditor.type('bold');
        await studioTextEditor.bold();
        await studioTextEditor.type(' ');
        await studioTextEditor.italic();
        await studioTextEditor.type('italic');
        await studioTextEditor.italic();
        await studioTextEditor.type(' ');
        await studioTextEditor.underline();
        await studioTextEditor.type('underlined');
        await studioTextEditor.underline();
        await studioTextEditor.newParagraph();
        await studioTextEditor.heading(2);
        await studioTextEditor.type('E2E heading');
        // The toolbar's own functions, by TinyMCE's command names.
        await studioTextEditor.newParagraph();
        await studioTextEditor.toolbar('aligncenter');
        await studioTextEditor.type('E2E centered');
        await studioTextEditor.newParagraph();
        await studioTextEditor.toolbar('alignright');
        await studioTextEditor.type('E2E right');
        await studioTextEditor.newParagraph();
        await studioTextEditor.toolbar('alignleft');
        await studioTextEditor.toolbar('bullist');
        await studioTextEditor.type('E2E bullet');
        // Enter on an empty item leaves the list.
        await studioTextEditor.newParagraph();
        await studioTextEditor.newParagraph();
        await studioTextEditor.toolbar('blockquote');
        await studioTextEditor.type('E2E quote');
        await studioTextEditor.newParagraph();
        await studioTextEditor.toolbar('blockquote');
        await studioTextEditor.toolbar('forecolor');
        await studioTextEditor.toolbar('backcolor');
        await studioTextEditor.type('E2E colored');
        // Two links from the link dialog; the second is then broken again.
        await studioTextEditor.newParagraph();
        await studioTextEditor.insertLink('https://example.com/e2e-kept', 'E2E kept link');
        await studioTextEditor.newParagraph();
        await studioTextEditor.insertLink('https://example.com/e2e-broken', 'E2E broken link');
        await studioTextEditor.caretLeft();
        await studioTextEditor.toolbar('unlink');
        await studioTextEditor.newParagraph();
        await studioTextEditor.type('E2E emoji ');
        await studioTextEditor.insertEmoji(EMOJI);
        await studioTextEditor.save();

        const components = await fetchContainerChildren(page.request, config, unitKey);
        const html = components.find((c) => c.block_type === 'html');
        expect(html).toBeDefined();
        const data = (await fetchXBlock(page.request, config, html?.block_id ?? '')).data ?? '';
        expect(data).toContain('<strong>bold</strong>');
        expect(data).toContain('<em>italic</em>');
        expect(data).toContain('E2E plain');
        expect(data).toMatch(/<span style="text-decoration: underline;?">underlined<\/span>/);
        expect(data).toMatch(/<h2[^>]*>E2E heading<\/h2>/);
        expect(data).toMatch(/<p style="text-align: center;?">E2E centered<\/p>/);
        expect(data).toMatch(/<p style="text-align: right;?">E2E right<\/p>/);
        expect(data).toMatch(/<ul>\s*<li[^>]*>E2E bullet<\/li>\s*<\/ul>/);
        expect(data).toMatch(/<blockquote>\s*<p[^>]*>E2E quote<\/p>\s*<\/blockquote>/);
        // Text colour and highlight wrap the run in styled spans.
        const colored = /<p[^>]*>(.*E2E colored.*)<\/p>/.exec(data)?.[1] ?? '';
        expect(colored).toMatch(/style="[^"]*(?<!-)color: [^"]+"/);
        expect(colored).toMatch(/style="[^"]*background-color: [^"]+"/);
        expect(data).toMatch(
          /<a [^>]*href="https:\/\/example\.com\/e2e-kept"[^>]*>E2E kept link<\/a>/,
        );
        expect(data).toContain('E2E broken link');
        expect(data).not.toContain('e2e-broken');
        expect(data).toContain(`E2E emoji ${EMOJI}`);
      },
    );

    test(
      'asks before discarding: Cancel offers to keep editing or to discard and exit',
      { annotation: testId('TC-00217') },
      async ({
        page,
        config,
        studioUnitPage,
        studioTextEditor,
        authoringCourse,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const unitKey = await buildUnit(page.request, config, authoringCourse.courseKey, {
          label: 'text-cancel',
        });
        const text = `E2E unsaved ${test.info().testId.slice(-6)}`;

        await studioUnitPage.goto(unitKey);
        const types = availableComponentTypes(await fetchContainer(page.request, config, unitKey));
        await studioUnitPage.openAddComponent(types.indexOf('html'));
        await studioTextEditor.chooseTemplate('html');
        await studioTextEditor.type(text);

        // Cancel asks first; keeping on editing leaves the editor and its text.
        await studioTextEditor.cancel();
        await studioTextEditor.keepEditing();
        await expect(studioTextEditor.dialog).toBeVisible();
        await expect(studioTextEditor.content).toContainText(text);

        // Cancel again and discard: the editor closes and nothing typed is kept.
        await studioTextEditor.cancel();
        await studioTextEditor.discard();
        await expect(studioTextEditor.dialog).toBeHidden();
        const saved = await Promise.all(
          (await fetchContainerChildren(page.request, config, unitKey)).map(
            async (child) => (await fetchXBlock(page.request, config, child.block_id)).data ?? '',
          ),
        );
        expect(saved.join('\n')).not.toContain(text);
      },
    );
  },
);
