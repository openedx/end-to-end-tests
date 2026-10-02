import { test, expect } from '@playwright/test';

import { firstAdminResultPk } from '../../src/api';

/**
 * Pure unit tests for reading a Django admin change list. No browser or target.
 */
test.describe('firstAdminResultPk', { tag: '@unit' }, () => {
  const USERS = '/admin/auth/user';
  const results = (pk: string) =>
    `<table id="result_list"><thead><tr><th>Username</th></tr></thead>` +
    `<tbody><tr><th><a href="${USERS}/${pk}/change/">e2e_new</a></th></tr></tbody></table>`;

  test('reads the first result row', () => {
    expect(firstAdminResultPk(`<div id="changelist">${results('57')}</div>`, USERS)).toBe('57');
  });

  test('ignores a change link above the results, as a queued success message carries', () => {
    const message =
      `<ul class="messagelist"><li class="success">The user ` +
      `“<a href="${USERS}/18/change/">e2e_old</a>” was changed successfully.</li></ul>`;
    expect(firstAdminResultPk(`${message}${results('57')}`, USERS)).toBe('57');
  });

  test('finds nothing when the search matched no row', () => {
    const message = `<ul class="messagelist"><li><a href="${USERS}/18/change/">e2e_old</a></li></ul>`;
    expect(firstAdminResultPk(`${message}<p class="paginator">0 users</p>`, USERS)).toBeUndefined();
  });
});
