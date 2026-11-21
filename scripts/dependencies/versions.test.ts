/**
 * Unit tests of versions.ts: parsing with and without pre-release identifiers and build metadata,
 * which release is newer, and which versions are compatible by npm's caret rule.
 *
 * @module
 */

import { expect, test } from 'vitest';

import { isCompatible, isNewer, isRelease, newestCompatible, parseRelease } from './versions.ts';

test('versions parse with and without pre-release and build metadata', () => {
	expect(parseRelease('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, isPrerelease: false });
	expect(parseRelease('2.0.0-rc.1+build.5')).toEqual({
		major: 2,
		minor: 0,
		patch: 0,
		isPrerelease: true
	});
	expect(() => parseRelease('1.2')).toThrow("isn't a semantic version");
	expect(isRelease('6.0.3')).toBe(true);
	expect(isRelease('v6.0.3')).toBe(false);
});

test('a release is newer by its numbers, or as the release of a pre-release', () => {
	expect(isNewer(parseRelease('1.10.0'), parseRelease('1.9.9'))).toBe(true);
	expect(isNewer(parseRelease('1.0.0'), parseRelease('1.0.0'))).toBe(false);
	expect(isNewer(parseRelease('1.0.0'), parseRelease('1.0.0-rc.2'))).toBe(true);
});

test('compatibility follows the caret rule', () => {
	const compatible = (candidate: string, current: string): boolean =>
		isCompatible(parseRelease(candidate), parseRelease(current));
	expect(compatible('6.9.0', '6.0.3')).toBe(true);
	expect(compatible('7.0.0', '6.0.3')).toBe(false);
	expect(compatible('0.29.5', '0.29.0')).toBe(true);
	expect(compatible('0.30.0', '0.29.0')).toBe(false);
	expect(compatible('0.0.4', '0.0.3')).toBe(false);
});

test('the newest compatible version skips pre-releases and incompatible versions', () => {
	expect(newestCompatible(['6.0.2', '6.0.3', '6.0.4', '6.1.0-beta', '7.0.2'], '6.0.3')).toBe(
		'6.0.4'
	);
	expect(newestCompatible(['7.0.2', '6.0.3'], '6.0.3')).toBe('6.0.3');
});
