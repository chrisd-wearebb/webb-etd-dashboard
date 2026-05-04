import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dashboardFilterIds,
  defaultDashboardSettings,
  parseList,
  validateDashboardSettings
} from '../server/dashboardSettings.js';

test('builds dashboard settings from environment values', () => {
  const settings = defaultDashboardSettings({
    EVENT_DAYS_BACK: '14',
    PREP_DAYS_PAST: '7',
    PREP_DAYS_FUTURE: '45',
    PAGE_SIZE: '250',
    REFRESH_SECONDS: '120',
    OFFICE_IDS: '439, 442',
    JOB_TYPE_IDS: '860,847'
  });

  assert.deepEqual(settings, {
    eventDaysBack: 14,
    prepDaysPast: 7,
    prepDaysFuture: 45,
    pageSize: 250,
    refreshSeconds: 120,
    officeNames: ['Rental', 'Integration'],
    jobTypeNames: ['Integration', 'Sale']
  });
});

test('normalizes comma separated lists', () => {
  assert.deepEqual(parseList(' Rental,Webb, ,Integration '), ['Rental', 'Webb', 'Integration']);
});

test('validates and merges partial settings', () => {
  const base = defaultDashboardSettings();
  const settings = validateDashboardSettings({ pageSize: '100', officeNames: ['Webb', '360'] }, base);

  assert.equal(settings.pageSize, 100);
  assert.deepEqual(settings.officeNames, ['Webb', '360']);
  assert.equal(settings.eventDaysBack, base.eventDaysBack);
});

test('converts selected names to IE filter ids', () => {
  const ids = dashboardFilterIds({
    officeNames: ['Webb'],
    jobTypeNames: ['Sale', 'Production']
  });

  assert.deepEqual(ids, {
    officeIds: ['438'],
    jobTypeIds: ['847', '848']
  });
});

test('maps legacy saved ids to names', () => {
  const settings = validateDashboardSettings({
    officeIds: '439,446',
    jobTypeIds: '850,859'
  });

  assert.deepEqual(settings.officeNames, ['Rental', '360']);
  assert.deepEqual(settings.jobTypeNames, ['Service Call', 'Crimson Club Event']);
});

test('rejects out of range numeric settings', () => {
  assert.throws(
    () => validateDashboardSettings({ refreshSeconds: '5' }),
    /Refresh seconds must be a whole number from 30 to 3600/
  );
});

test('rejects unknown filter names', () => {
  assert.throws(
    () => validateDashboardSettings({ officeNames: ['Not an office'] }),
    /Office "Not an office" is not a valid option/
  );
});
