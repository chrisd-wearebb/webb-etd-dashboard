import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SETTINGS_FILE = new URL('../config/dashboard-settings.json', import.meta.url);

export const SETTING_LIMITS = {
  eventDaysBack: { min: 0, max: 365 },
  prepDaysPast: { min: 0, max: 365 },
  prepDaysFuture: { min: 0, max: 365 },
  pageSize: { min: 1, max: 1000 },
  refreshSeconds: { min: 30, max: 3600 }
};

export function parseIdList(value) {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

export function defaultDashboardSettings(env = process.env) {
  return {
    eventDaysBack: envNumber(env.EVENT_DAYS_BACK, 45),
    prepDaysPast: envNumber(env.PREP_DAYS_PAST, 30),
    prepDaysFuture: envNumber(env.PREP_DAYS_FUTURE, 60),
    pageSize: envNumber(env.PAGE_SIZE, 500),
    refreshSeconds: envNumber(env.REFRESH_SECONDS, 300),
    officeIds: parseIdList(env.OFFICE_IDS),
    jobTypeIds: parseIdList(env.JOB_TYPE_IDS)
  };
}

export function validateDashboardSettings(input, base = defaultDashboardSettings()) {
  const source = { ...base, ...input };

  return {
    eventDaysBack: boundedInteger(source.eventDaysBack, 'Event days back', SETTING_LIMITS.eventDaysBack),
    prepDaysPast: boundedInteger(source.prepDaysPast, 'Prep days past', SETTING_LIMITS.prepDaysPast),
    prepDaysFuture: boundedInteger(source.prepDaysFuture, 'Prep days future', SETTING_LIMITS.prepDaysFuture),
    pageSize: boundedInteger(source.pageSize, 'Page size', SETTING_LIMITS.pageSize),
    refreshSeconds: boundedInteger(source.refreshSeconds, 'Refresh seconds', SETTING_LIMITS.refreshSeconds),
    officeIds: parseIdList(source.officeIds),
    jobTypeIds: parseIdList(source.jobTypeIds)
  };
}

export async function loadDashboardSettings(fileUrl = SETTINGS_FILE, env = process.env) {
  const defaults = defaultDashboardSettings(env);

  try {
    const saved = JSON.parse(await readFile(fileUrl, 'utf8'));
    return validateDashboardSettings(saved, defaults);
  } catch (err) {
    if (err.code === 'ENOENT') return defaults;
    throw err;
  }
}

export async function saveDashboardSettings(settings, fileUrl = SETTINGS_FILE) {
  const filePath = fileURLToPath(fileUrl);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`);
}

function envNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedInteger(value, label, { min, max }) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  }

  return parsed;
}
