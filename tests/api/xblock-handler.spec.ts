import { expect, test } from '@playwright/test';

import {
  narrowConditionalContent,
  narrowPollResults,
  narrowSurveyResults,
  narrowWordCloudState,
} from '../../src/api';

// Bodies as the local `main` stack answered them (xblock-poll 1.16, xblocks-contrib 1.0).
test.describe('XBlock handler readers', { tag: '@unit' }, () => {
  test('narrows poll results to each answer count', () => {
    const results = narrowPollResults({
      question: '<p>E2E question?</p>',
      tally: [
        { count: 1, answer: '<p>Red</p>', key: 'R', choice: true, percent: 100 },
        { count: 0, answer: '<p>Blue</p>', key: 'B', choice: false, percent: 0 },
      ],
      total: 1,
      feedback: '',
    });
    expect(results).toEqual({
      question: '<p>E2E question?</p>',
      total: 1,
      tally: [
        { key: 'R', count: 1 },
        { key: 'B', count: 0 },
      ],
    });
  });

  test('narrows survey results per question', () => {
    const results = narrowSurveyResults({
      answers: [{ key: 'Y', label: 'Yes' }],
      tally: [{ label: '<p>Q</p>', key: 'enjoy', answers: [{ count: 1, key: 'Y', choice: true }] }],
    });
    expect(results).toEqual([{ key: 'enjoy', answers: [{ key: 'Y', count: 1 }] }]);
  });

  test('narrows a word cloud to the learner’s words', () => {
    const state = narrowWordCloudState({
      status: 'success',
      submitted: true,
      student_words: { alpha: 1, beta: 1 },
      total_count: 2,
      top_words: [],
    });
    expect(state).toEqual({ submitted: true, studentWords: { alpha: 1, beta: 1 }, totalCount: 2 });
  });

  test('rejects a failed word cloud answer', () => {
    expect(() => narrowWordCloudState({ status: 'fail', error: 'already posted' })).toThrow();
  });

  test('reads an unmet conditional as its message only', () => {
    const content = narrowConditionalContent({
      fragments: [{ content: '<p class="conditional-message">…</p>' }],
      message: true,
    });
    expect(content.met).toBe(false);
  });

  test('reads a met conditional as its children', () => {
    const content = narrowConditionalContent({
      fragments: [{ content: '<div class="xblock"><p>E2E-REVEALED</p></div>' }],
    });
    expect(content).toEqual({
      met: true,
      fragments: ['<div class="xblock"><p>E2E-REVEALED</p></div>'],
    });
  });

  test('rejects an unexpected poll body', () => {
    expect(() => narrowPollResults({ success: false })).toThrow();
  });
});
