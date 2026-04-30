import assert from 'node:assert/strict';
import test from 'node:test';

import { extractItemFromNote } from '../server/noteParser.js';

test('extracts added items from note prefixes', () => {
  assert.deepEqual(extractItemFromNote('Added: 12 Chauvet Colorado PXL16'), {
    verb: 'added',
    item: '12 Chauvet Colorado PXL16'
  });
});

test('handles product update prefixes', () => {
  assert.deepEqual(extractItemFromNote('Product Update: Changed: cable package'), {
    verb: 'changed',
    item: 'cable package'
  });
});

test('normalizes verbs found later in the note', () => {
  assert.deepEqual(extractItemFromNote('Qty changed from 8 to 12'), {
    verb: 'changed',
    item: 'Qty changed from 8 to 12'
  });
});

test('returns neutral data for notes without a known verb', () => {
  assert.deepEqual(extractItemFromNote('Ready for review'), {
    verb: null,
    item: 'Ready for review'
  });
});

test('handles empty notes', () => {
  assert.deepEqual(extractItemFromNote(null), {
    verb: null,
    item: ''
  });
});
