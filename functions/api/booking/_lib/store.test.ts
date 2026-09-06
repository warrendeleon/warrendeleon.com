import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { localised, toEventType, toSchedule, type EventTypeRow, type ScheduleRow } from './store.ts';

const eventTypeRow: EventTypeRow = {
  slug: 'recruiter-call',
  duration_minutes: 30,
  names: '{"en":"Recruiter call","es":"Llamada con reclutador"}',
  descriptions: '{"en":"A short intro."}',
  locations: '["video","phone"]',
  organiser_account: 'hi@warrendeleon.com',
  mirror_to: '[]',
  schedule_id: 'evenings',
  buffer_minutes: 15,
  min_notice_hours: 24,
  days_ahead_limit: 30,
  max_per_day: 5,
  visibility: 'listed',
  active: 1,
  sort_order: 0,
  target_calendar_id: 'warrendeleon.com_abc@group.calendar.google.com',
  question: '{"en":"What is the role?","es":"¿Qué puesto es?"}',
  question_required: 1,
  allow_guests: 1,
};

describe('event type rows', () => {
  it('parses the JSON columns and gathers the rules', () => {
    const type = toEventType(eventTypeRow);
    assert.equal(type.slug, 'recruiter-call');
    assert.deepEqual(type.locations, ['video', 'phone']);
    assert.equal(type.names.es, 'Llamada con reclutador');
    assert.deepEqual(type.rules, {
      durationMinutes: 30,
      bufferMinutes: 15,
      minNoticeHours: 24,
      daysAheadLimit: 30,
      maxPerDay: 5,
    });
  });

  it('carries the target calendar and the per-type question', () => {
    const type = toEventType(eventTypeRow);
    assert.equal(type.targetCalendarId, 'warrendeleon.com_abc@group.calendar.google.com');
    assert.equal(type.question.es, '¿Qué puesto es?');
    assert.equal(type.questionRequired, true);
    assert.equal(toEventType({ ...eventTypeRow, target_calendar_id: '' }).targetCalendarId, 'primary');
  });

  it('survives a malformed JSON column instead of failing the page', () => {
    const type = toEventType({ ...eventTypeRow, locations: 'not json', mirror_to: '{oops' });
    assert.deepEqual(type.locations, ['video']);
    assert.deepEqual(type.mirrorTo, []);
  });

  it('keeps the organiser and the mirror list apart', () => {
    const type = toEventType({
      ...eventTypeRow,
      organiser_account: 'warren.deleonofalla@news.co.uk',
      mirror_to: '["hi@warrendeleon.com"]',
    });
    assert.equal(type.organiserAccount, 'warren.deleonofalla@news.co.uk');
    assert.deepEqual(type.mirrorTo, ['hi@warrendeleon.com']);
  });
});

describe('schedule rows', () => {
  const row: ScheduleRow = {
    id: 'work-hours',
    name: 'Work hours',
    timezone: 'Europe/London',
    weekly_hours: '{"1":[["09:00","17:00"]]}',
    date_overrides: '{"2026-12-25":[]}',
  };

  it('parses windows and overrides', () => {
    const schedule = toSchedule(row);
    assert.equal(schedule.timezone, 'Europe/London');
    assert.deepEqual(schedule.weeklyHours['1'], [['09:00', '17:00']]);
    assert.deepEqual(schedule.dateOverrides?.['2026-12-25'], []);
  });

  it('treats an unreadable column as empty rather than throwing', () => {
    const schedule = toSchedule({ ...row, weekly_hours: 'broken' });
    assert.deepEqual(schedule.weeklyHours, {});
  });
});

describe('translations', () => {
  const names = { en: 'Recruiter call', es: 'Llamada con reclutador' };

  it('prefers the visitor locale', () => {
    assert.equal(localised(names, 'es'), 'Llamada con reclutador');
  });

  it('falls back to English, then to anything present', () => {
    assert.equal(localised(names, 'tl'), 'Recruiter call');
    assert.equal(localised({ ca: 'Trucada' }, 'en'), 'Trucada');
    assert.equal(localised({}, 'en'), '');
  });
});
