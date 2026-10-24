import { describe, expect, it } from 'vitest';
import { toIsoInZone } from '../nodes/ReachHunt/dates';

describe('toIsoInZone', () => {
	it('reads a local time in the given time zone', () => {
		expect(toIsoInZone('2026-10-21T10:00:00', 'Asia/Kolkata')).toBe('2026-10-21T04:30:00.000Z');
		expect(toIsoInZone('2026-10-21 10:00', 'UTC')).toBe('2026-10-21T10:00:00.000Z');
		expect(toIsoInZone('2026-10-21', 'America/New_York')).toBe('2026-10-21T04:00:00.000Z');
	});

	it('follows daylight saving time', () => {
		expect(toIsoInZone('2026-01-15T09:00:00', 'Europe/London')).toBe('2026-01-15T09:00:00.000Z');
		expect(toIsoInZone('2026-07-15T09:00:00', 'Europe/London')).toBe('2026-07-15T08:00:00.000Z');
	});

	it('keeps times that already have an offset', () => {
		expect(toIsoInZone('2026-10-21T10:00:00Z', 'Asia/Kolkata')).toBe('2026-10-21T10:00:00.000Z');
		expect(toIsoInZone('2026-10-21T10:00:00.000+02:00', 'Asia/Kolkata')).toBe('2026-10-21T08:00:00.000Z');
	});

	it('rejects text that is not a date', () => {
		expect(() => toIsoInZone('next tuesday', 'UTC')).toThrow('not a valid date');
	});
});
