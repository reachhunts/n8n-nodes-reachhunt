import { createHmac, timingSafeEqual } from 'crypto';

export const SIGNATURE_HEADER = 'x-reachhunt-signature';
export const TOLERANCE_SECONDS = 300;

const parseHeader = (header: string): Record<string, string> =>
	Object.fromEntries(
		header.split(',').map((part) => {
			const separator = part.indexOf('=');
			return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
		}),
	);

export function verifySignature(
	header: unknown,
	rawBody: string,
	secret: string,
	nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
	if (typeof header !== 'string' || !secret) return false;
	const { t, v1 } = parseHeader(header);
	const timestamp = Number(t);
	if (!Number.isInteger(timestamp) || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
	if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;

	const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
	const received = Buffer.from(v1, 'hex');
	return received.length === expected.length && timingSafeEqual(received, expected);
}
