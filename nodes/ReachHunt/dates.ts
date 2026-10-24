const LOCAL_DATE_TIME =
	/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/;

const offsetAt = (instant: number, timeZone: string): number => {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(new Date(instant));
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((item) => item.type === type)?.value);
	const wall = Date.UTC(
		part('year'),
		part('month') - 1,
		part('day'),
		part('hour') % 24,
		part('minute'),
		part('second'),
	);
	return wall - (instant - (((instant % 1000) + 1000) % 1000));
};

export function toIsoInZone(value: string, timeZone: string): string {
	const text = value.trim();
	const local = LOCAL_DATE_TIME.exec(text);
	if (!local) {
		const parsed = new Date(text);
		if (Number.isNaN(parsed.getTime())) throw new RangeError(`"${value}" is not a valid date`);
		return parsed.toISOString();
	}
	const [, year, month, day, hour = '0', minute = '0', second = '0', millis = '0'] = local;
	const wall = Date.UTC(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hour),
		Number(minute),
		Number(second),
		Number(millis.padEnd(3, '0')),
	);
	const firstGuess = wall - offsetAt(wall, timeZone);
	return new Date(wall - offsetAt(firstGuess, timeZone)).toISOString();
}
