'use strict';

const TIMEZONE_ALIASES = Object.freeze({
  IST: 'Asia/Kolkata',
  UTC: 'Etc/UTC',
  GMT: 'Etc/UTC',
  // The portal's legacy EST value represents Eastern Time for customers.
  // America/New_York handles the EST/EDT daylight-saving transition.
  EST: 'America/New_York',
  PST: 'Etc/GMT+8',
  PT: 'Etc/GMT+7',
  MST: 'Etc/GMT+7',
  CST: 'Etc/GMT+6',
  JST: 'Asia/Tokyo',
  CET: 'Etc/GMT-1',
  CEST: 'Etc/GMT-2',
  ISR: 'Etc/GMT-2',
  IDT: 'Etc/GMT-3'
});

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

function minutesToHM(total) {
  const minutes = finiteNonNegative(total) || 0;
  return {
    total: minutes,
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
    text: minutes > 0
      ? (minutes >= 60
        ? Math.floor(minutes / 60) + 'h' + (minutes % 60 ? ' ' + (minutes % 60) + 'm' : '')
        : minutes + 'm')
      : ''
  };
}

function parseDurationText(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return finiteNonNegative(text);
  const hours = Number((text.match(/(\d+(?:\.\d+)?)\s*h/i) || [])[1] || 0);
  const minutes = Number((text.match(/(\d+)\s*m/i) || [])[1] || 0);
  if (!hours && !minutes) return null;
  return finiteNonNegative(hours * 60 + minutes);
}

function resolveDurationMinutes(body, prefix, fallback) {
  const canonicalKeys = prefix === 'downtime'
    ? ['downtime_mins', 'downtime_minutes_total']
    : [prefix + '_minutes'];
  for (const key of canonicalKeys) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '') {
      return finiteNonNegative(body[key]);
    }
  }

  const hourKeys = [prefix + 'H', prefix + '_h'];
  const minuteKeys = [prefix + 'M', prefix + '_m'];
  const hasParts = hourKeys.concat(minuteKeys).some((key) => body[key] !== undefined);
  if (hasParts) {
    const hours = Number(body[hourKeys.find((key) => body[key] !== undefined)] || 0);
    const minutes = Number(body[minuteKeys.find((key) => body[key] !== undefined)] || 0);
    return finiteNonNegative((Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0));
  }

  const text = body[prefix + 'Str'] ?? body[prefix + '_str'];
  const parsed = parseDurationText(text);
  return parsed === null ? fallback : parsed;
}

function normalizeIanaTimezone(value) {
  const raw = String(value || 'IST').trim();
  const mapped = TIMEZONE_ALIASES[raw.toUpperCase()] || raw;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: mapped }).format(new Date());
    return mapped;
  } catch (_) {
    return 'Asia/Kolkata';
  }
}

function timezoneOffsetMilliseconds(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    - date.getTime();
}

function localDateTimeToUtc(value, timezone) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
  const raw = String(value).trim();
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(raw)) {
    const absolute = new Date(raw);
    return Number.isNaN(absolute.getTime()) ? null : absolute.toISOString().slice(0, 19).replace('T', ' ');
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const zone = normalizeIanaTimezone(timezone);
  const localAsUtc = Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6] || 0)
  );
  let utc = localAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    utc = localAsUtc - timezoneOffsetMilliseconds(new Date(utc), zone);
  }
  return new Date(utc).toISOString().slice(0, 19).replace('T', ' ');
}

function buildCanonicalValues(body, current) {
  const timezone = body.source_timezone || body.timezone || current?.source_timezone || current?.timezone || 'IST';
  const sourceTimezone = normalizeIanaTimezone(timezone);
  const openedLocal = body.date_time_opened ?? body.startDT ?? body.date_created ?? body.date;
  const closedLocal = body.date_time_closed ?? body.endDT ?? body.closed_at;
  const downtime = resolveDurationMinutes(body, 'downtime', current?.downtime_mins ?? 0);
  const mttd = resolveDurationMinutes(body, 'mttd', current?.mttd_minutes ?? null);
  const mttr = resolveDurationMinutes(body, 'mttr', current?.mttr_minutes ?? parseDurationText(current?.mttr_str));
  const slaMinutes = body.sla_minutes !== undefined
    ? finiteNonNegative(body.sla_minutes)
    : (body.sla_hours !== undefined && body.sla_hours !== null && body.sla_hours !== ''
      ? finiteNonNegative(Number(body.sla_hours) * 60)
      : current?.sla_minutes ?? null);

  return {
    source_timezone: sourceTimezone,
    opened_at_utc: openedLocal !== undefined ? localDateTimeToUtc(openedLocal, sourceTimezone) : undefined,
    closed_at_utc: closedLocal !== undefined ? localDateTimeToUtc(closedLocal, sourceTimezone) : undefined,
    downtime_mins: downtime,
    mttd_minutes: mttd,
    mttr_minutes: mttr,
    sla_minutes: slaMinutes
  };
}

module.exports = {
  TIMEZONE_ALIASES,
  buildCanonicalValues,
  finiteNonNegative,
  localDateTimeToUtc,
  minutesToHM,
  normalizeIanaTimezone,
  parseDurationText,
  resolveDurationMinutes
};
