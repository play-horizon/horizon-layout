/**
 * Unit tests of how the demo reads its saved state back (`parseDemoState` in `persistence.ts`).
 * @module
 */
import { describe, expect, it } from 'vitest';
import { parseDemoState } from './persistence.js';

const nestedPage = { id: 'nested', title: 'Nested layout', kind: 'nested', persistent: true };

function saved(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		persist: true,
		config: { root: { tabs: ['nested', 'page-2'], activeTabIndex: 0 } },
		pages: [nestedPage, { id: 'page-2', title: 'Page 2', kind: 'blank' }],
		...overrides
	};
}

describe('parseDemoState', () => {
	it('fills in the default options', () => {
		expect(parseDemoState(saved())).toEqual({
			config: { root: { tabs: ['nested', 'page-2'], activeTabIndex: 0 } },
			pages: [
				{ id: 'nested', title: 'Nested layout', kind: 'nested', persistent: true },
				{ id: 'page-2', title: 'Page 2', kind: 'blank', persistent: false }
			],
			theme: 'dark',
			showSplitRatio: true,
			disableResizeSplits: false,
			disableDragAndDrop: false,
			hideTabBar: false,
			skipValidation: false,
			minWidthRatio: 0.1,
			minHeightRatio: 0.2,
			maxDepth: 6,
			ratioFormat: 'percent'
		});
	});

	it('keeps valid options and clamps the constraints', () => {
		const state = parseDemoState(
			saved({
				theme: 'nord',
				hideTabBar: true,
				ratioFormat: 'fraction',
				minWidthRatio: 0.9,
				minHeightRatio: -1,
				maxDepth: 42.4
			})
		);
		expect(state?.theme).toBe('nord');
		expect(state?.hideTabBar).toBe(true);
		expect(state?.ratioFormat).toBe('fraction');
		expect(state?.minWidthRatio).toBe(0.45);
		expect(state?.minHeightRatio).toBe(0);
		expect(state?.maxDepth).toBe(10);
	});

	it('replaces an unknown theme, ratio format and page kind', () => {
		const state = parseDemoState(
			saved({
				theme: 'neon',
				ratioFormat: 'roman',
				pages: [nestedPage, { id: 'page-2', title: 'Page 2', kind: 'chart' }]
			})
		);
		expect(state?.theme).toBe('dark');
		expect(state?.ratioFormat).toBe('percent');
		expect(state?.pages[1]?.kind).toBe('blank');
	});

	it('rejects a config that names a view no page has', () => {
		const config = { root: { tabs: ['nested', 'page-9'], activeTabIndex: 0 } };
		expect(parseDemoState(saved({ config }))).toBeNull();
	});

	it('rejects a config whose panes are smaller than the saved minimum', () => {
		const config = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['nested'], activeTabIndex: 0 },
					{ tabs: ['page-2'], activeTabIndex: 0 }
				],
				splitPoints: [0.05]
			}
		};
		expect(parseDemoState(saved({ config, minWidthRatio: 0.1 }))).toBeNull();
	});

	it('rejects a malformed config', () => {
		expect(parseDemoState(saved({ config: { root: { tabs: [] } } }))).toBeNull();
	});

	it('rejects two pages with one id', () => {
		const pages = [nestedPage, nestedPage];
		const config = { root: { tabs: ['nested'], activeTabIndex: 0 } };
		expect(parseDemoState(saved({ pages, config }))).toBeNull();
	});

	it('rejects pages without the nested layout', () => {
		const pages = [{ id: 'page-2', title: 'Page 2', kind: 'blank' }];
		const config = { root: { tabs: ['page-2'], activeTabIndex: 0 } };
		expect(parseDemoState(saved({ pages, config }))).toBeNull();
	});
});
