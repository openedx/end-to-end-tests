import { test, expect } from '@playwright/test';

import {
  COMPETENCY_SETS,
  competencyImportFile,
  parseExportedIds,
  renameCompetencyIds,
} from '../../src/steps';

/**
 * The competency import files the re-import cases upload, and the parser of a taxonomy
 * export they read back. Pure: no browser, no network.
 */

const A = COMPETENCY_SETS.oneToRename;

test.describe('renameCompetencyIds', { tag: '@unit' }, () => {
  test('gives a renamed row its old ID as previousId and leaves the others alone', () => {
    const rows = renameCompetencyIds(A, { 'COMP-A': { id: 'COMP-B' } });
    expect(rows[0]).toEqual({ id: 'COMP-B', value: 'Competency A', previousId: 'COMP-A' });
    expect(rows.slice(1)).toEqual(A.slice(1));
  });

  test('applies every rename to the original IDs, so two IDs can be exchanged', () => {
    const rows = renameCompetencyIds(COMPETENCY_SETS.pair, {
      'COMP-A': { id: 'COMP-B' },
      'COMP-B': { id: 'COMP-A' },
    });
    expect(rows).toEqual([
      { id: 'COMP-B', value: 'Competency X', previousId: 'COMP-A' },
      { id: 'COMP-A', value: 'Competency Y', previousId: 'COMP-B' },
    ]);
  });

  test('keeps the ID when the patch has none and sets previousId to it', () => {
    const rows = renameCompetencyIds(COMPETENCY_SETS.pair, { 'COMP-B': {} });
    expect(rows[1]).toEqual({ id: 'COMP-B', value: 'Competency Y', previousId: 'COMP-B' });
  });

  test('points a child at its renamed parent and applies a new value', () => {
    const rows = renameCompetencyIds(COMPETENCY_SETS.parentWithChild, {
      'COMP-P': { id: 'COMP-P2', value: 'Parent P Renamed' },
    });
    expect(rows).toEqual([
      { id: 'COMP-P2', value: 'Parent P Renamed', previousId: 'COMP-P' },
      { id: 'COMP-C1', value: 'Child C', parentId: 'COMP-P2' },
    ]);
  });
});

test.describe('renameCompetencyIds, parents with children', { tag: '@unit' }, () => {
  test('swapping two parents repoints each child at its parent new ID, parents first', () => {
    const rows = renameCompetencyIds(COMPETENCY_SETS.twoParents, {
      'COMP-1': { id: 'COMP-3' },
      'COMP-3': { id: 'COMP-1' },
    });
    expect(rows).toEqual([
      { id: 'COMP-3', value: 'Parent One', previousId: 'COMP-1' },
      { id: 'COMP-1', value: 'Parent Three', previousId: 'COMP-3' },
      { id: 'COMP-1A', value: 'Child One', parentId: 'COMP-3' },
      { id: 'COMP-3A', value: 'Child Three', parentId: 'COMP-1' },
    ]);
  });
});

test.describe('competencyImportFile', { tag: '@unit' }, () => {
  test('writes a CSV without a previous_id column when no row has one', () => {
    const file = competencyImportFile(A, { format: 'csv' });
    expect(file.mimeType).toBe('text/csv');
    expect(file.name.endsWith('.csv')).toBe(true);
    expect(file.buffer.toString('utf8').split('\n')).toEqual([
      'id,value,parent_id',
      'COMP-A,Competency A,',
      'COMP-N1,Neutral Competency 1,',
      'COMP-N2,Neutral Competency 2,',
      'COMP-N3,Neutral Competency 3,',
    ]);
  });

  test('adds the previous_id column, empty on rows without one, when any row has one', () => {
    const rows = renameCompetencyIds(A, { 'COMP-A': { id: 'COMP-B' } });
    const lines = competencyImportFile(rows, { format: 'csv' }).buffer.toString('utf8').split('\n');
    expect(lines[0]).toBe('id,value,parent_id,previous_id');
    expect(lines[1]).toBe('COMP-B,Competency A,,COMP-A');
    expect(lines[2]).toBe('COMP-N1,Neutral Competency 1,,');
  });

  test('quotes a CSV cell that holds a comma or a quote', () => {
    const file = competencyImportFile([{ id: 'X', value: 'Say "hi", then go' }], {
      format: 'csv',
    });
    expect(file.buffer.toString('utf8').split('\n')[1]).toBe('X,"Say ""hi"", then go",');
  });

  test('writes JSON under a tags root with previous_id only on the rows that set it', () => {
    const rows = renameCompetencyIds(COMPETENCY_SETS.parentWithChild, {
      'COMP-P': { id: 'COMP-P2' },
    });
    const file = competencyImportFile(rows, { format: 'json' });
    expect(file.name).toBe('e2e-competency-ids.json');
    expect(file.mimeType).toBe('application/json');
    expect(JSON.parse(file.buffer.toString('utf8'))).toEqual({
      tags: [
        { id: 'COMP-P2', value: 'Parent P', parent_id: '', previous_id: 'COMP-P' },
        { id: 'COMP-C1', value: 'Child C', parent_id: 'COMP-P2' },
      ],
    });
  });
});

test.describe('parseExportedIds', { tag: '@unit' }, () => {
  test('reads a CSV export with CRLF line ends, empty parents as null and the header as keys', () => {
    const text = 'id,value,parent_id\r\nCOMP-B,Competency A,\r\nC1,Child one,COMP-B\r\n';
    expect(parseExportedIds(text, 'csv')).toEqual([
      { id: 'COMP-B', value: 'Competency A', parentId: null, keys: ['id', 'value', 'parent_id'] },
      {
        id: 'C1',
        value: 'Child one',
        parentId: 'COMP-B',
        keys: ['id', 'value', 'parent_id'],
      },
    ]);
  });

  test('reads a JSON export, taking an empty or null parent as null and each entry keys', () => {
    const text = JSON.stringify({
      name: 'T',
      description: '',
      tags: [
        { id: 'R', value: 'Root', parent_id: null },
        { id: 'C', value: 'Child', parent_id: 'R', previous_id: 'old' },
        { id: 'S', value: 'Other', parent_id: '' },
      ],
    });
    const tags = parseExportedIds(text, 'json');
    expect(tags.map((t) => t.parentId)).toEqual([null, 'R', null]);
    expect(tags[1]?.keys).toEqual(['id', 'value', 'parent_id', 'previous_id']);
  });

  test('rejects an export that is not the format', () => {
    expect(() => parseExportedIds('', 'csv')).toThrow('no header');
    expect(() => parseExportedIds('id,value,parent_id\nX,"a, b",', 'csv')).toThrow('quoted');
    expect(() => parseExportedIds('{"name":"T"}', 'json')).toThrow('"tags"');
  });

  test('rejects a JSON entry whose id is not a string, as when the export falls back to _id', () => {
    const text = JSON.stringify({ tags: [{ id: 17, value: 'Root' }] });
    expect(() => parseExportedIds(text, 'json')).toThrow('not a string');
  });
});
