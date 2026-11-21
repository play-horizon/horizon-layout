/**
 * Unit tests of pnpm-outdated.ts, on hand-written `pnpm outdated` and `pnpm view` output and exit
 * statuses: what passes, what fails and malformed output; and the Node.js line `node` and
 * `@types/node` follow.
 *
 * @module
 */

import { expect, test } from 'vitest';

import { followNodeLine, readOutdatedResult, readVersionsResult } from './pnpm-outdated.ts';

const report = JSON.stringify({
	vitest: { current: '5.1.0', latest: '5.1.1', wanted: '5.1.0', dependencyType: 'devDependencies' },
	node: {
		current: '26.0.0',
		latest: '26.13.1',
		wanted: '26.0.0',
		dependencyType: 'devDependencies'
	},
	'@sveltejs/kit': { current: '3.2.0', latest: '3.4.0', wanted: '3.2.0' }
});

test('the outdated packages come sorted by name', () => {
	expect(readOutdatedResult({ status: 1, stdout: report, stderr: '' })).toEqual([
		{ name: '@sveltejs/kit', current: '3.2.0', latest: '3.4.0' },
		{ name: 'node', current: '26.0.0', latest: '26.13.1' },
		{ name: 'vitest', current: '5.1.0', latest: '5.1.1' }
	]);
	expect(readOutdatedResult({ status: 0, stdout: '{}', stderr: '' })).toEqual([]);
});

test('a failed or malformed run is refused', () => {
	expect(() => readOutdatedResult({ status: 1, stdout: '{}', stderr: '' })).toThrow(
		'pnpm outdated failed (exit status 1)'
	);
	expect(() => readOutdatedResult({ status: 1, stdout: '', stderr: 'ERR_PNPM_FETCH_404' })).toThrow(
		'pnpm outdated failed: ERR_PNPM_FETCH_404'
	);
	expect(() => readOutdatedResult({ status: 0, stdout: '[]', stderr: '' })).toThrow('no report');
	expect(() =>
		readOutdatedResult({
			status: 1,
			stdout: JSON.stringify({ svelte: { current: '5.0.0' } }),
			stderr: ''
		})
	).toThrow('no current and latest version of svelte');
});

test('the published versions are read as a list or a single version', () => {
	expect(
		readVersionsResult('typescript', { status: 0, stdout: '["6.0.3", "7.0.2"]', stderr: '' })
	).toEqual(['6.0.3', '7.0.2']);
	expect(readVersionsResult('tiny', { status: 0, stdout: '"1.0.0"', stderr: '' })).toEqual([
		'1.0.0'
	]);
	expect(() => readVersionsResult('typescript', { status: 1, stdout: '', stderr: 'E404' })).toThrow(
		'pnpm view typescript versions failed: E404'
	);
	expect(() => readVersionsResult('typescript', { status: 0, stdout: '[1]', stderr: '' })).toThrow(
		'printed no list of versions'
	);
});

test('node is left out and @types/node follows the Node.js line', () => {
	const node = { name: 'node', current: '26.0.0', latest: '26.13.1' };
	const svelte = { name: 'svelte', current: '5.57.3', latest: '5.58.0' };
	const typesNode = { name: '@types/node', current: '26.6.6', latest: '27.0.1' };
	// On the line, with nothing newer in it: not outdated.
	expect(followNodeLine([node, svelte, typesNode], 26, '26.6.6')).toEqual([svelte]);
	// On the line, with a newer release in it: outdated to that release.
	expect(followNodeLine([typesNode], 26, '26.7.0')).toEqual([
		{ name: '@types/node', current: '26.6.6', latest: '26.7.0' }
	]);
	// Off the line: outdated as pnpm reports it.
	expect(followNodeLine([{ ...typesNode, current: '24.19.2' }], 26, undefined)).toEqual([
		{ name: '@types/node', current: '24.19.2', latest: '27.0.1' }
	]);
});
