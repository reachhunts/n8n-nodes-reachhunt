import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { verifySignature } from '../nodes/ReachHuntTrigger/signature';

const SECRET = 'rh_wh_test-secret';
const NOW = 1_800_000_000;
const BODY = JSON.stringify({ id: 'evt_1', type: 'message.received', data: { text: 'Hi 👋' } });

const sign = (body: string, timestamp = NOW, secret = SECRET) =>
	`t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

describe('verifySignature', () => {
	it('accepts a body signed with the secret', () => {
		expect(verifySignature(sign(BODY), BODY, SECRET, NOW)).toBe(true);
	});

	it('rejects a changed body', () => {
		expect(verifySignature(sign(BODY), BODY.replace('Hi', 'Yo'), SECRET, NOW)).toBe(false);
	});

	it('rejects another secret', () => {
		expect(verifySignature(sign(BODY, NOW, 'rh_wh_other'), BODY, SECRET, NOW)).toBe(false);
	});

	it('rejects a signature older than five minutes', () => {
		expect(verifySignature(sign(BODY, NOW - 301), BODY, SECRET, NOW)).toBe(false);
		expect(verifySignature(sign(BODY, NOW - 299), BODY, SECRET, NOW)).toBe(true);
	});

	it('rejects missing or malformed headers', () => {
		expect(verifySignature(undefined, BODY, SECRET, NOW)).toBe(false);
		expect(verifySignature('v1=abc', BODY, SECRET, NOW)).toBe(false);
		expect(verifySignature(`t=${NOW},v1=zz`, BODY, SECRET, NOW)).toBe(false);
		expect(verifySignature(sign(BODY), BODY, '', NOW)).toBe(false);
	});
});
