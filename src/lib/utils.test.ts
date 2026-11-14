/**
 * Unit tests of the public config helpers: validating, parsing, cloning and comparing layout
 * configs, simplifying the tree, and finding, removing and floating views.
 * @module
 */
import { describe, expect, it } from 'vitest';
import type {
	FloatingGroupConfig,
	LayoutConfig,
	NodeConfig,
	SplitConfig,
	TabGroupConfig
} from './types.ts';
import {
	areConfigsEquivalent,
	buildNodeParentMap,
	cloneConfig,
	findTabGroup,
	floatView,
	nodeConfigType,
	parseLayoutConfig,
	removeView,
	simplifyTabGroup,
	validateConfig
} from './utils.ts';

const views = new Map(['a', 'b', 'c', 'd'].map((id) => [id, {}]));
const rect = { x: 10, y: 20, width: 300, height: 200 };

function threePaneConfig(): LayoutConfig {
	return {
		root: {
			direction: 'horizontal',
			views: [
				{ tabs: ['a'], activeTabIndex: 0 },
				{
					direction: 'vertical',
					views: [
						{ tabs: ['b', 'c'], activeTabIndex: 1 },
						{ tabs: ['d'], activeTabIndex: 0 }
					],
					splitPoints: [0.5]
				}
			],
			splitPoints: [0.4]
		}
	};
}

describe('nodeConfigType', () => {
	it('tells splits and tab groups apart', () => {
		const config = threePaneConfig();
		const root = config.root as SplitConfig;
		expect(nodeConfigType(root)).toBe('split');
		expect(nodeConfigType(root.views[0])).toBe('tabGroup');
	});
});

describe('buildNodeParentMap', () => {
	it('maps every node except the root to its parent and index', () => {
		const root = threePaneConfig().root as SplitConfig;
		const inner = root.views[1] as SplitConfig;
		const map = buildNodeParentMap(root);

		expect(map.size).toBe(4);
		expect(map.has(root)).toBe(false);
		expect(map.get(root.views[0])).toEqual({ parent: root, index: 0 });
		expect(map.get(inner)).toEqual({ parent: root, index: 1 });
		expect(map.get(inner.views[0])).toEqual({ parent: inner, index: 0 });
		expect(map.get(inner.views[1])).toEqual({ parent: inner, index: 1 });
	});

	it('returns an empty map for a lone tab group', () => {
		expect(buildNodeParentMap({ tabs: ['a'], activeTabIndex: 0 }).size).toBe(0);
	});
});

describe('validateConfig', () => {
	it('accepts a valid config', () => {
		expect(() => validateConfig(threePaneConfig(), views)).not.toThrow();
	});

	it('accepts an empty layout', () => {
		expect(() => validateConfig({}, views)).not.toThrow();
	});

	it('accepts a layout exactly maxDepth deep', () => {
		expect(() => validateConfig(threePaneConfig(), views, { maxDepth: 3 })).not.toThrow();
		expect(() =>
			validateConfig({ root: { tabs: ['a'], activeTabIndex: 0 } }, views, { maxDepth: 1 })
		).not.toThrow();
	});

	it('rejects a layout deeper than maxDepth, naming the first node too deep', () => {
		expect(() => validateConfig(threePaneConfig(), views, { maxDepth: 2 })).toThrow(
			'config.root.views[1].views[0]: nested 3 deep, deeper than maxDepth (2)'
		);
		expect(() => validateConfig(threePaneConfig(), views, { maxDepth: 1 })).toThrow(
			'config.root.views[0]: nested 2 deep, deeper than maxDepth (1)'
		);
	});

	it('rejects a maxDepth that is not an integer of at least 1', () => {
		for (const maxDepth of [0, 2.5, Number.NaN]) {
			expect(() => validateConfig({}, views, { maxDepth })).toThrow(
				`options.maxDepth: expected an integer of at least 1, got ${maxDepth}`
			);
		}
	});

	it('takes a maxDepth of 6 by default', () => {
		// Six splits, each the first view of the one around it: tab group a is 7 deep.
		let root: NodeConfig = { tabs: ['a'], activeTabIndex: 0 };
		const ids = ['b', 'c', 'd', 'e', 'f', 'g'];
		for (const id of ids) {
			root = {
				direction: 'horizontal',
				views: [root, { tabs: [id], activeTabIndex: 0 }],
				splitPoints: [0.5]
			};
		}
		const deepViews = new Map(['a', ...ids].map((id) => [id, {}]));

		expect(() => validateConfig({ root }, deepViews)).toThrow(
			'config.root.views[0].views[0].views[0].views[0].views[0].views[0]: nested 7 deep, deeper than maxDepth (6)'
		);
		expect(() => validateConfig({ root }, deepViews, { maxDepth: 7 })).not.toThrow();
	});

	it('rejects an unknown tab id', () => {
		const config: LayoutConfig = { root: { tabs: ['missing'], activeTabIndex: 0 } };
		expect(() => validateConfig(config, views)).toThrow(
			'config.root.tabs[0]: unknown view id "missing"'
		);
	});

	it('rejects a tab that appears twice', () => {
		const config: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['a'], activeTabIndex: 0 }
				],
				splitPoints: [0.5]
			}
		};
		expect(() => validateConfig(config, views)).toThrow(
			'config.root.views[1].tabs[0]: view "a" is shown more than once'
		);
	});

	it('rejects an out-of-range activeTabIndex', () => {
		const config: LayoutConfig = { root: { tabs: ['a'], activeTabIndex: 1 } };
		expect(() => validateConfig(config, views)).toThrow(
			'config.root.activeTabIndex: expected an integer from 0 to 0, the index of a tab'
		);
	});

	it('rejects a split whose splitPoints do not match its views', () => {
		const config = threePaneConfig();
		(config.root as SplitConfig).splitPoints = [0.3, 0.6];
		expect(() => validateConfig(config, views)).toThrow(
			'config.root.splitPoints: expected one split point per gap between views'
		);
	});

	it('rejects split points closer than the minimum ratio', () => {
		const config = threePaneConfig();
		(config.root as SplitConfig).splitPoints = [0.05];
		expect(() => validateConfig(config, views)).toThrow(
			'config.root.splitPoints[0]: leaves a pane smaller than the minimum ratio'
		);
		expect(() => validateConfig(config, views, { minWidthRatio: 0.01 })).not.toThrow();
	});

	it('rejects split points closer than the minimum ratio to the far edge', () => {
		const config = threePaneConfig();
		(config.root as SplitConfig).splitPoints = [0.95];
		expect(() => validateConfig(config, views)).toThrow(
			'config.root.splitPoints[0]: leaves a pane smaller than the minimum ratio'
		);
	});

	it('checks vertical splits against minHeightRatio', () => {
		const config = threePaneConfig();
		const inner = (config.root as SplitConfig).views[1] as SplitConfig;
		inner.splitPoints = [0.15];
		expect(() => validateConfig(config, views)).toThrow(
			'config.root.views[1].splitPoints[0]: leaves a pane smaller than the minimum ratio'
		);
		expect(() => validateConfig(config, views, { minHeightRatio: 0.1 })).not.toThrow();
	});

	it.each([
		[[0.3, 0.6], null],
		[[0.2, 0.3], null],
		[[0.4, 0.45], 1],
		[[0.6, 0.3], 1]
	])('checks consecutive split points %o', (splitPoints, badIndex) => {
		const config: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 },
					{ tabs: ['c'], activeTabIndex: 0 }
				],
				splitPoints: splitPoints as [number, ...number[]]
			}
		};
		if (badIndex === null) expect(() => validateConfig(config, views)).not.toThrow();
		else
			expect(() => validateConfig(config, views)).toThrow(
				`config.root.splitPoints[${badIndex}]: leaves a pane smaller than the minimum ratio`
			);
	});

	it('accepts a split point clamped to a minRatio with more than 4 decimals', () => {
		const config = threePaneConfig();
		(config.root as SplitConfig).splitPoints = [0.3333];
		expect(() => validateConfig(config, views, { minWidthRatio: 1 / 3 })).not.toThrow();
	});

	it('rejects a negative activeTabIndex', () => {
		const config: LayoutConfig = { root: { tabs: ['a'], activeTabIndex: -1 } };
		expect(() => validateConfig(config, views)).toThrow(
			'config.root.activeTabIndex: expected an integer from 0 to 0, the index of a tab'
		);
	});

	it('rejects a fractional activeTabIndex and an empty tab group', () => {
		const fractional: LayoutConfig = { root: { tabs: ['a', 'b'], activeTabIndex: 0.5 } };
		expect(() => validateConfig(fractional, views)).toThrow(
			'config.root.activeTabIndex: expected an integer from 0 to 1, the index of a tab'
		);
		const empty = { root: { tabs: [], activeTabIndex: 0 } } as unknown as LayoutConfig;
		expect(() => validateConfig(empty, views)).toThrow(
			'config.root.tabs: expected at least one tab'
		);
	});

	it('rejects a split with a single view', () => {
		const config = {
			root: {
				direction: 'horizontal',
				views: [{ tabs: ['a'], activeTabIndex: 0 }],
				splitPoints: []
			}
		} as unknown as LayoutConfig;
		expect(() => validateConfig(config, views)).toThrow(
			'config.root.views: expected at least two views'
		);
	});

	it.each([Number.NaN, Infinity])('rejects the split point %s', (point) => {
		const config = threePaneConfig();
		(config.root as SplitConfig).splitPoints = [point];
		expect(() => validateConfig(config, views)).toThrow(
			'config.root.splitPoints[0]: expected a finite number'
		);
	});

	it('rejects a tab that appears twice in the same group', () => {
		const config: LayoutConfig = { root: { tabs: ['a', 'a'], activeTabIndex: 0 } };
		expect(() => validateConfig(config, views)).toThrow(
			'config.root.tabs[1]: view "a" is shown more than once'
		);
	});

	it('rejects an unknown tab id in a nested group', () => {
		const config = threePaneConfig();
		const inner = (config.root as SplitConfig).views[1] as SplitConfig;
		(inner.views[1] as TabGroupConfig).tabs = ['missing'];
		expect(() => validateConfig(config, views)).toThrow(
			'config.root.views[1].views[1].tabs[0]: unknown view id "missing"'
		);
	});

	it('accepts known maximizedView and popout ids', () => {
		const more = new Map([...views, ['e', {}], ['f', {}]]);
		const config: LayoutConfig = { ...threePaneConfig(), maximizedView: 'a', popouts: ['e', 'f'] };
		expect(() => validateConfig(config, more)).not.toThrow();
	});

	it('rejects a view shown in two places', () => {
		expect(() => validateConfig({ ...threePaneConfig(), popouts: ['b'] }, views)).toThrow(
			'config.root.views[1].views[0].tabs[0]: view "b" is shown more than once'
		);
		expect(() => validateConfig({ popouts: ['a', 'a'] }, views)).toThrow(
			'config.popouts[1]: view "a" is shown more than once'
		);
		const floating = { tabs: ['a'], activeTabIndex: 0, rect } as FloatingGroupConfig;
		expect(() => validateConfig({ ...threePaneConfig(), floating: [floating] }, views)).toThrow(
			'config.root.views[0].tabs[0]: view "a" is shown more than once'
		);
	});

	it('rejects unknown maximizedView and popout ids', () => {
		expect(() => validateConfig({ maximizedView: 'x' }, views)).toThrow(
			'config.maximizedView: unknown view id "x"'
		);
		expect(() => validateConfig({ popouts: ['a', 'y'] }, views)).toThrow(
			'config.popouts[1]: unknown view id "y"'
		);
	});

	it('rejects maximizing a view that is in a popout', () => {
		expect(() => validateConfig({ maximizedView: 'a', popouts: ['a'] }, views)).toThrow(
			'config.maximizedView: view "a" is in a popout'
		);
	});

	it('accepts ids whose view value is falsy', () => {
		const falsyViews = new Map([
			['a', 0],
			['b', null]
		]);
		const config: LayoutConfig = {
			root: { tabs: ['a'], activeTabIndex: 0 },
			maximizedView: 'a',
			popouts: ['b']
		};
		expect(() => validateConfig(config, falsyViews)).not.toThrow();
	});
});

describe('validateConfig with a minimum ratio finer than the stored points', () => {
	it('takes the ratio at 4 decimals, as split points are stored', () => {
		const split = (splitPoints: [number, number]): LayoutConfig => ({
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 },
					{ tabs: ['c'], activeTabIndex: 0 }
				],
				splitPoints
			}
		});
		// 0.10005 is taken as 0.1001, so the second pane, 0.1 wide, is too narrow.
		expect(() =>
			validateConfig(split([0.1074, 0.2075]), views, { minWidthRatio: 0.10005 })
		).not.toThrow();
		expect(() =>
			validateConfig(split([0.1074, 0.2074]), views, { minWidthRatio: 0.10005 })
		).toThrow('config.root.splitPoints[1]: leaves a pane smaller than the minimum ratio');
	});
});

describe('validateConfig with floating groups', () => {
	it('accepts floating groups next to the docked layout', () => {
		const floating: FloatingGroupConfig[] = [{ tabs: ['e'], activeTabIndex: 0, rect }];
		const more = new Map([...views, ['e', {}]]);
		expect(() => validateConfig({ ...threePaneConfig(), floating }, more)).not.toThrow();
		expect(() => validateConfig({ floating }, more)).not.toThrow();
	});

	it('rejects a floating group with a bad tab list or rect', () => {
		const bad = (group: object) => () =>
			validateConfig({ floating: [group as FloatingGroupConfig] }, views);
		expect(bad({ tabs: ['a'], activeTabIndex: 1, rect })).toThrow(
			'config.floating[0].activeTabIndex: expected an integer from 0 to 0, the index of a tab'
		);
		expect(bad({ tabs: ['x'], activeTabIndex: 0, rect })).toThrow(
			'config.floating[0].tabs[0]: unknown view id "x"'
		);
		for (const broken of [{ width: 0 }, { height: -1 }, { x: Number.NaN }, { y: Infinity }]) {
			expect(bad({ tabs: ['a'], activeTabIndex: 0, rect: { ...rect, ...broken } })).toThrow(
				'config.floating[0].rect: expected finite numbers and a positive width and height'
			);
		}
	});
});

describe('parseLayoutConfig', () => {
	it('round-trips a config through JSON', () => {
		const config = threePaneConfig();
		const parsed = parseLayoutConfig(JSON.parse(JSON.stringify(config)));
		expect(parsed).toEqual(config);
	});

	it('drops an empty popouts array', () => {
		expect(parseLayoutConfig({ popouts: [] })).toEqual({});
	});

	it('parses maximizedView and popouts', () => {
		const config: LayoutConfig = { maximizedView: 'a', popouts: ['b', 'c'] };
		expect(parseLayoutConfig(config)).toEqual(config);
	});

	it('ignores a null root and drops unknown fields', () => {
		expect(parseLayoutConfig({ root: null, extra: 1 })).toEqual({});
		expect(parseLayoutConfig({ root: { tabs: ['a'], activeTabIndex: 0, extra: true } })).toEqual({
			root: { tabs: ['a'], activeTabIndex: 0 }
		});
	});

	it.each([
		['a', 'config.root: expected an object'],
		[{}, 'config.root.tabs: expected a non-empty array'],
		[{ tabs: [], activeTabIndex: 0 }, 'config.root.tabs: expected a non-empty array'],
		[{ tabs: ['a'] }, 'config.root.activeTabIndex: expected a number']
	])('rejects an invalid tab group (%o)', (root, message) => {
		expect(() => parseLayoutConfig({ root })).toThrow(message);
	});

	it('rejects invalid maximizedView and popout ids', () => {
		expect(() => parseLayoutConfig({ maximizedView: '' })).toThrow(
			'config.maximizedView: expected a non-empty string'
		);
		expect(() => parseLayoutConfig({ popouts: ['a', 3] })).toThrow(
			'config.popouts[1]: expected a non-empty string'
		);
		expect(() => parseLayoutConfig({ popouts: 'a' })).toThrow('config.popouts: expected an array');
	});

	it('rejects values that are not objects', () => {
		expect(() => parseLayoutConfig(null)).toThrow('config: expected an object');
		expect(() => parseLayoutConfig('layout')).toThrow('config: expected an object');
	});

	it('rejects an empty tab id', () => {
		expect(() => parseLayoutConfig({ root: { tabs: [''], activeTabIndex: 0 } })).toThrow(
			'config.root.tabs[0]: expected a non-empty string'
		);
	});

	it.each([
		[{ direction: 'diagonal' }, 'config.root.direction: expected "horizontal" or "vertical"'],
		[
			{ views: [{ tabs: ['a'], activeTabIndex: 0 }] },
			'config.root.views: expected an array of at least 2 elements'
		],
		[{ splitPoints: [] }, 'config.root.splitPoints: expected a non-empty array'],
		[{ splitPoints: ['0.5'] }, 'config.root.splitPoints[0]: expected a number']
	])('reports what is wrong with an invalid split (%o)', (override, message) => {
		const root = { ...threePaneConfig().root, ...override };
		expect(() => parseLayoutConfig({ root })).toThrow(message);
	});

	it('reports the path of an invalid nested node', () => {
		const config = threePaneConfig();
		const inner = (config.root as SplitConfig).views[1] as SplitConfig;
		delete (inner.views[1] as Partial<TabGroupConfig>).activeTabIndex;
		expect(() => parseLayoutConfig(config)).toThrow(
			'config.root.views[1].views[1].activeTabIndex: expected a number'
		);
	});
});

describe('parseLayoutConfig with floating groups', () => {
	it('round-trips floating groups through JSON, and drops an empty list', () => {
		const config: LayoutConfig = {
			floating: [{ tabs: ['a', 'b'], activeTabIndex: 1, rect }]
		};
		expect(parseLayoutConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
		expect(parseLayoutConfig({ floating: [] })).toEqual({});
	});

	it('says what is wrong with a floating group', () => {
		expect(() => parseLayoutConfig({ floating: {} })).toThrow('config.floating: expected an array');
		expect(() => parseLayoutConfig({ floating: [3] })).toThrow(
			'config.floating[0]: expected an object'
		);
		expect(() => parseLayoutConfig({ floating: [{ tabs: ['a'], activeTabIndex: 0 }] })).toThrow(
			'config.floating[0].rect: expected an object'
		);
		expect(() =>
			parseLayoutConfig({
				floating: [{ tabs: ['a'], activeTabIndex: 0, rect: { ...rect, width: '3' } }]
			})
		).toThrow('config.floating[0].rect.width: expected a number');
	});
});

describe('cloneConfig', () => {
	it('returns an equal config that shares no nodes with the original', () => {
		const config = threePaneConfig();
		const clone = cloneConfig(config);
		expect(clone).toEqual(config);
		(clone.root as SplitConfig).splitPoints[0] = 0.7;
		expect((config.root as SplitConfig).splitPoints[0]).toBe(0.4);
	});

	it('copies maximizedView and popouts without sharing the popouts array', () => {
		const config: LayoutConfig = { ...threePaneConfig(), maximizedView: 'a', popouts: ['b'] };
		const clone = cloneConfig(config);
		expect(clone).toEqual(config);
		clone.popouts!.push('c');
		expect(config.popouts).toEqual(['b']);
	});

	it('drops empty popouts and floating arrays', () => {
		expect(cloneConfig({ popouts: [] })).toEqual({});
		expect(cloneConfig({ floating: [] })).toEqual({});
		expect(cloneConfig({})).toEqual({});
	});
});

describe('cloneConfig and areConfigsEquivalent with floating groups', () => {
	it('copies floating groups deeply', () => {
		const config: LayoutConfig = { floating: [{ tabs: ['a'], activeTabIndex: 0, rect }] };
		const copy = cloneConfig(config);
		expect(copy).toEqual(config);
		expect(copy.floating![0]!.rect).not.toBe(rect);
	});

	it('compares floating groups in order, with their rect', () => {
		const one = { tabs: ['a'], activeTabIndex: 0, rect } as FloatingGroupConfig;
		const two = { tabs: ['b'], activeTabIndex: 0, rect } as FloatingGroupConfig;
		expect(areConfigsEquivalent({ floating: [one, two] }, { floating: [one, two] })).toBe(true);
		expect(areConfigsEquivalent({ floating: [one, two] }, { floating: [two, one] })).toBe(false);
		const moved = { ...one, rect: { ...rect, x: 11 } };
		expect(areConfigsEquivalent({ floating: [one] }, { floating: [moved] })).toBe(false);
		expect(areConfigsEquivalent({ floating: [one] }, {})).toBe(false);
	});
});

describe('areConfigsEquivalent', () => {
	it('ignores popout order', () => {
		const a: LayoutConfig = { popouts: ['a', 'b'] };
		const b: LayoutConfig = { popouts: ['b', 'a'] };
		expect(areConfigsEquivalent(a, b)).toBe(true);
	});

	it('detects a moved split point', () => {
		const a = threePaneConfig();
		const b = threePaneConfig();
		(b.root as SplitConfig).splitPoints[0] = 0.6;
		expect(areConfigsEquivalent(a, b)).toBe(false);
	});

	it('detects a different active tab', () => {
		const a = threePaneConfig();
		const b = threePaneConfig();
		const inner = (b.root as SplitConfig).views[1] as SplitConfig;
		(inner.views[0] as TabGroupConfig).activeTabIndex = 0;
		expect(areConfigsEquivalent(a, b)).toBe(false);
	});

	it('treats two identical layouts as equivalent', () => {
		expect(areConfigsEquivalent(threePaneConfig(), threePaneConfig())).toBe(true);
		expect(areConfigsEquivalent({}, {})).toBe(true);
	});

	it.each<[string, (config: LayoutConfig) => void]>([
		['maximizedView', (c) => (c.maximizedView = 'a')],
		['missing root', (c) => delete c.root],
		['popout count', (c) => (c.popouts = ['a'])],
		[
			'split vs tab group',
			(c) => ((c.root as SplitConfig).views[1] = { tabs: ['b'], activeTabIndex: 0 })
		],
		['direction', (c) => ((c.root as SplitConfig).direction = 'vertical')],
		['view count', (c) => (c.root as SplitConfig).views.push({ tabs: ['d'], activeTabIndex: 0 })],
		['split point count', (c) => (c.root as SplitConfig).splitPoints.push(0.8)],
		[
			'tab count',
			(c) => ((c.root as SplitConfig).views[0] = { tabs: ['a', 'b'], activeTabIndex: 0 })
		],
		['tab id', (c) => ((c.root as SplitConfig).views[0] = { tabs: ['b'], activeTabIndex: 0 })]
	])('detects a different %s', (_, change) => {
		const a = threePaneConfig();
		const b = threePaneConfig();
		change(b);
		expect(areConfigsEquivalent(a, b)).toBe(false);
		expect(areConfigsEquivalent(b, a)).toBe(false);
	});

	it('detects popouts with the same count but different ids', () => {
		expect(areConfigsEquivalent({ popouts: ['a'] }, { popouts: ['b'] })).toBe(false);
	});
});

describe('simplifyTabGroup', () => {
	it('collapses a split left with a single child', () => {
		const config = threePaneConfig();
		const inner = (config.root as SplitConfig).views[1] as SplitConfig;
		const emptied = inner.views[1] as TabGroupConfig;
		(emptied.tabs as string[]).length = 0;

		simplifyTabGroup(emptied, buildNodeParentMap(config.root!), config);

		expect(config.root).toEqual({
			direction: 'horizontal',
			views: [
				{ tabs: ['a'], activeTabIndex: 0 },
				{ tabs: ['b', 'c'], activeTabIndex: 1 }
			],
			splitPoints: [0.4]
		});
	});

	it('clears the root when the last tab group empties', () => {
		const group: TabGroupConfig = { tabs: ['a'], activeTabIndex: 0 };
		const config: LayoutConfig = { root: group };
		(group.tabs as string[]).length = 0;

		simplifyTabGroup(group, buildNodeParentMap(group), config);

		expect(config.root).toBeUndefined();
	});

	it('leaves a non-empty tab group alone', () => {
		const config = threePaneConfig();
		const before = cloneConfig(config);
		const root = config.root as SplitConfig;

		simplifyTabGroup(root.views[0] as TabGroupConfig, buildNodeParentMap(root), config);

		expect(config).toEqual(before);
	});

	it('replaces the root when the root split is left with a single child', () => {
		const config = threePaneConfig();
		const root = config.root as SplitConfig;
		const emptied = root.views[0] as TabGroupConfig;
		(emptied.tabs as string[]).length = 0;

		simplifyTabGroup(emptied, buildNodeParentMap(root), config);

		expect(config.root).toBe(root.views[0]);
		expect(config.root).toEqual({
			direction: 'vertical',
			views: [
				{ tabs: ['b', 'c'], activeTabIndex: 1 },
				{ tabs: ['d'], activeTabIndex: 0 }
			],
			splitPoints: [0.5]
		});
	});

	it.each([
		[0, ['b', 'c'], [0.6]],
		[1, ['a', 'c'], [0.3]],
		[2, ['a', 'b'], [0.3]]
	])('removes child %i of a three-way split', (index, remainingTabs, splitPoints) => {
		const root: SplitConfig = {
			direction: 'horizontal',
			views: [
				{ tabs: ['a'], activeTabIndex: 0 },
				{ tabs: ['b'], activeTabIndex: 0 },
				{ tabs: ['c'], activeTabIndex: 0 }
			],
			splitPoints: [0.3, 0.6]
		};
		const config: LayoutConfig = { root };
		const emptied = root.views[index] as TabGroupConfig;
		(emptied.tabs as string[]).length = 0;

		simplifyTabGroup(emptied, buildNodeParentMap(root), config);

		expect(config.root).toBe(root);
		expect(root.views.map((v) => (v as TabGroupConfig).tabs[0])).toEqual(remainingTabs);
		expect(root.splitPoints).toEqual(splitPoints);
	});

	it('collapses a deeply nested split into its parent', () => {
		const deepest: SplitConfig = {
			direction: 'horizontal',
			views: [
				{ tabs: ['c'], activeTabIndex: 0 },
				{ tabs: ['d'], activeTabIndex: 0 }
			],
			splitPoints: [0.5]
		};
		const config: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{
						direction: 'vertical',
						views: [{ tabs: ['b'], activeTabIndex: 0 }, deepest],
						splitPoints: [0.5]
					}
				],
				splitPoints: [0.5]
			}
		};
		const emptied = deepest.views[1] as TabGroupConfig;
		(emptied.tabs as string[]).length = 0;

		simplifyTabGroup(emptied, buildNodeParentMap(config.root!), config);

		expect(config.root).toEqual({
			direction: 'horizontal',
			views: [
				{ tabs: ['a'], activeTabIndex: 0 },
				{
					direction: 'vertical',
					views: [
						{ tabs: ['b'], activeTabIndex: 0 },
						{ tabs: ['c'], activeTabIndex: 0 }
					],
					splitPoints: [0.5]
				}
			],
			splitPoints: [0.5]
		});
	});
});

describe('simplifyTabGroup with floating groups', () => {
	it('removes an emptied floating group, and the list once it is empty', () => {
		const first = { tabs: ['a'], activeTabIndex: 0, rect } as FloatingGroupConfig;
		const second = { tabs: ['b'], activeTabIndex: 0, rect } as FloatingGroupConfig;
		const config: LayoutConfig = { ...threePaneConfig(), floating: [first, second] };
		const root = config.root;
		(first.tabs as string[]).length = 0;

		simplifyTabGroup(first, buildNodeParentMap(config.root!), config);
		expect(config.floating).toEqual([second]);
		expect(config.root).toBe(root);

		(second.tabs as string[]).length = 0;
		simplifyTabGroup(second, buildNodeParentMap(config.root!), config);
		expect(config.floating).toBeUndefined();
	});
});

describe('findTabGroup', () => {
	it('finds docked and floating groups, and nothing else', () => {
		const floating = { tabs: ['e'], activeTabIndex: 0, rect } as FloatingGroupConfig;
		const config: LayoutConfig = { ...threePaneConfig(), floating: [floating], popouts: ['f'] };
		const inner = (config.root as SplitConfig).views[1] as SplitConfig;
		expect(findTabGroup(config, 'c')).toBe(inner.views[0]);
		expect(findTabGroup(config, 'e')).toBe(floating);
		expect(findTabGroup(config, 'f')).toBeUndefined();
		expect(findTabGroup({}, 'a')).toBeUndefined();
	});
});

describe('removeView', () => {
	it('takes a tab out, keeping the active tab, and collapses an emptied pane', () => {
		const config = threePaneConfig();
		removeView(config, 'b');
		const inner = (config.root as SplitConfig).views[1] as SplitConfig;
		expect(inner.views[0]).toEqual({ tabs: ['c'], activeTabIndex: 0 });

		removeView(config, 'd');
		expect(config.root).toEqual({
			direction: 'horizontal',
			views: [
				{ tabs: ['a'], activeTabIndex: 0 },
				{ tabs: ['c'], activeTabIndex: 0 }
			],
			splitPoints: [0.4]
		});
	});

	it('moves the active tab to the next one when the active tab leaves', () => {
		const config: LayoutConfig = { root: { tabs: ['a', 'b', 'c'], activeTabIndex: 1 } };
		removeView(config, 'b');
		expect(config.root).toEqual({ tabs: ['a', 'c'], activeTabIndex: 1 });
		removeView(config, 'c');
		expect(config.root).toEqual({ tabs: ['a'], activeTabIndex: 0 });
	});

	it('keeps the active tab when a tab before it leaves', () => {
		const config: LayoutConfig = { root: { tabs: ['a', 'b', 'c'], activeTabIndex: 2 } };
		removeView(config, 'a');
		expect(config.root).toEqual({ tabs: ['b', 'c'], activeTabIndex: 1 });
	});

	it('does nothing for a view the layout does not show', () => {
		const config: LayoutConfig = { ...threePaneConfig(), popouts: ['e'], maximizedView: 'a' };
		removeView(config, 'x');
		expect(config).toEqual({ ...threePaneConfig(), popouts: ['e'], maximizedView: 'a' });
	});

	it('takes a view out of a floating group, the popouts and the maximized view', () => {
		const config: LayoutConfig = {
			floating: [{ tabs: ['a'], activeTabIndex: 0, rect }],
			popouts: ['b', 'c'],
			maximizedView: 'b'
		};
		removeView(config, 'a');
		removeView(config, 'b');
		expect(config).toEqual({ popouts: ['c'] });
		removeView(config, 'c');
		expect(config.popouts).toBeUndefined();
	});
});

describe('floatView', () => {
	it('moves a docked view into a new floating group on top', () => {
		const below = { tabs: ['e'], activeTabIndex: 0, rect } as FloatingGroupConfig;
		const config: LayoutConfig = {
			root: { tabs: ['a', 'b'], activeTabIndex: 0 },
			floating: [below]
		};
		const where = { x: 80, y: 60, width: 420, height: 520 };

		floatView(config, 'a', where);

		expect(config).toEqual({
			root: { tabs: ['b'], activeTabIndex: 0 },
			floating: [below, { tabs: ['a'], activeTabIndex: 0, rect: where }]
		});
		expect(config.floating![1]!.rect).not.toBe(where);
	});

	it('floats a view that was alone, leaving an empty layout behind', () => {
		const config: LayoutConfig = { root: { tabs: ['a'], activeTabIndex: 0 } };
		floatView(config, 'a', rect);
		expect(config).toEqual({ floating: [{ tabs: ['a'], activeTabIndex: 0, rect }] });
	});
});
