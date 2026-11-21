/**
 * Unit tests of held-back.ts: the held-back list's validation, and the verdict on hand-written
 * `pnpm outdated` results (held back, held back with a newer compatible release, outdated, past
 * its recheck day, stale, a failed lookup).
 *
 * @module
 */

import { describe, expect, test } from 'vitest';

import { judge, parseHeldBack, type HeldBack } from './held-back.ts';

const typescript: HeldBack = {
	package: 'typescript',
	reason: "svelte-check doesn't support TypeScript 7 yet",
	recheck: '2027-01-21'
};

/** A held-back list holding `typescript` with `entry`, as its file writes it. */
function list(entry: unknown = { reason: typescript.reason, recheck: typescript.recheck }): string {
	return JSON.stringify({ typescript: entry });
}

describe('parseHeldBack', () => {
	test('reads a valid list', () => {
		expect(parseHeldBack(list())).toEqual([typescript]);
		expect(parseHeldBack('{}')).toEqual([]);
	});

	test('refuses a list that is not an object of valid entries', () => {
		expect(() => parseHeldBack('[]')).toThrow('must be an object of packages');
		expect(() => parseHeldBack(list('soon'))).toThrow(
			"The held-back package typescript isn't an object"
		);
		expect(() => parseHeldBack(list({ reason: ' ', recheck: '2027-01-21' }))).toThrow(
			'gives no reason'
		);
		expect(() => parseHeldBack(list({ reason: 'x', recheck: '2027-01-21', until: 'x' }))).toThrow(
			'unknown fields: until'
		);
	});

	test('refuses impossible and malformed recheck days', () => {
		for (const recheck of ['2027-02-30', '2027-13-01', '21/01/2027', '2027-1-21']) {
			expect(() => parseHeldBack(list({ reason: 'x', recheck }))).toThrow('has no recheck day');
		}
	});
});

describe('judge', () => {
	const outdated = [
		{ name: 'svelte', current: '5.57.3', latest: '5.58.0' },
		{ name: 'typescript', current: '6.0.3', latest: '7.0.2' }
	];
	const compatible = new Map([['typescript', '6.0.3']]);

	test('a held-back package is listed apart and does not fail', () => {
		expect(judge(outdated, [typescript], '2026-11-21', compatible)).toEqual({
			outdated: [{ name: 'svelte', current: '5.57.3', latest: '5.58.0' }],
			heldBack: [{ ...typescript, current: '6.0.3', latest: '7.0.2' }],
			problems: []
		});
	});

	test('the recheck date itself still passes, the day after fails', () => {
		expect(judge(outdated, [typescript], '2027-01-21', compatible).problems).toEqual([]);
		expect(judge(outdated, [typescript], '2027-01-22', compatible).problems).toEqual([
			'typescript: its recheck day, 2027-01-21, has passed. Check whether the reason still ' +
				`holds ("svelte-check doesn't support TypeScript 7 yet"), then update the package or ` +
				'move the day.'
		]);
	});

	test('an entry whose package has no newer version is stale', () => {
		const verdict = judge(outdated.slice(0, 1), [typescript], '2026-11-21', new Map());
		expect(verdict.heldBack).toEqual([]);
		expect(verdict.problems).toEqual([
			'typescript is held back but has no newer version: remove its entry.'
		]);
	});

	test('a held-back package with a newer compatible version still fails on it', () => {
		const verdict = judge(outdated, [typescript], '2026-11-21', new Map([['typescript', '6.0.4']]));
		expect(verdict.problems).toEqual([]);
		expect(verdict.outdated).toEqual([
			{ name: 'svelte', current: '5.57.3', latest: '5.58.0' },
			{ name: 'typescript', current: '6.0.3', latest: '6.0.4' }
		]);
		expect(verdict.heldBack).toEqual([{ ...typescript, current: '6.0.3', latest: '7.0.2' }]);
	});

	test('a held-back package whose lookup failed fails the check, listed as held back', () => {
		const verdict = judge(outdated, [typescript], '2026-11-21', new Map());
		expect(verdict.problems).toEqual([
			"typescript: its newest release compatible with 6.0.3 couldn't be looked up, so the hold " +
				"can't be checked."
		]);
		expect(verdict.heldBack).toEqual([{ ...typescript, current: '6.0.3', latest: '7.0.2' }]);
	});

	test('a package whose versions are not releases cannot be held back', () => {
		const verdict = judge(
			[{ name: 'typescript', current: 'link:../typescript', latest: '7.0.2' }],
			[typescript],
			'2026-11-21',
			new Map()
		);
		expect(verdict.problems).toEqual([
			"typescript can't be held back: its versions (link:../typescript, 7.0.2) aren't release " +
				'versions.'
		]);
		expect(verdict.outdated).toEqual([
			{ name: 'typescript', current: 'link:../typescript', latest: '7.0.2' }
		]);
		expect(verdict.heldBack).toEqual([]);
	});
});
