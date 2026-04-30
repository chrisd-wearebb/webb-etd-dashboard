import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultDashboardSettings,
  parseIdList,
  validateDashboardSettings
} from '../server/dashboardSettings.js';

test('builds dashboard settings from environment values', () => {
  const settings = defaultDashboardSettings({
    EVENT_DAYS_BACK: '14',
    PREP_DAYS_PAST: '7',
    PREP_DAYS_FUTURE: '45',
    PAGE_SIZE: '250',
    REFRESH_SECONDS: '120',
    OFFICE_IDS: '1, 2',
    JOB_TYPE_IDS: '10,20'
  });

  assert.deepEqual(settings, {
    eventDaysBack: 14,
    prepDaysPast: 7,
    prepDaysFuture: 45,
    pageSize: 250,
    refreshSeconds: 120,
    officeIds: ['1', '2'],
    jobTypeIds: ['10', '20']
  });
});

test('normalizes comma separated id lists', () => {
  assert.deepEqual(parseIdList(' 1,2, ,3 '), ['1', '2', '3']);
});

test('validates and merges partial settings', () => {
  const base = defaultDashboardSettings();
  const settings = validateDashboardSettings({ pageSize: '100', officeIds: '7,8' }, base);

  assert.equal(settings.pageSize, 100);
  assert.deepEqual(settings.officeIds, ['7', '8']);
  assert.equal(settings.eventDaysBack, base.eventDaysBack);
});

test('rejects out of range numeric settings', () => {
  assert.throws(
    () => validateDashboardSettings({ refreshSeconds: '5' }),
    /Refresh seconds must be a whole number from 30 to 3600/
  );
});
