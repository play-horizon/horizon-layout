import { describe, expect, it } from 'vitest';
import type { LayoutConfig, SplitConfig, TabGroupConfig } from './types.ts';
import {
	areConfigsEquivalent,
	buildNodeParentMap,
	cloneConfig,
	nodeConfigType,
	parseLayoutConfig,
	simplifyTabGroup,
	validateConfig
} from './utils.ts';

const views = new Map(['a', 'b', 'c', 'd'].map((id) => [id, {}]));

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
});

describe('validateConfig', () => {
	it('accepts a valid config', () => {
		expect(() => validateConfig(threePaneConfig(), views)).not.toThrow();
	});

	it('accepts an empty layout', () => {
		expect(() => validateConfig({}, views)).not.toThrow();
	});

	it('rejects an unknown tab id', () => {
		const config: LayoutConfig = { root: { tabs: ['missing'], activeTabIndex: 0 } };
		expect(() => validateConfig(config, views)).toThrow('unknown tab id "missing"');
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
		expect(() => validateConfig(config, views)).toThrow('duplicate tab id "a"');
	});

	it('rejects an out-of-range activeTabIndex', () => {
		const config: LayoutConfig = { root: { tabs: ['a'], activeTabIndex: 1 } };
		expect(() => validateConfig(config, views)).toThrow('activeTabIndex out of range');
	});

	it('rejects a split whose splitPoints do not match its views', () => {
		const config = threePaneConfig();
		(config.root as SplitConfig).splitPoints = [0.3, 0.6];
		expect(() => validateConfig(config, views)).toThrow(
			'splitPoints.length must equal views.length - 1'
		);
	});

	it('rejects split points closer than the minimum ratio', () => {
		const config = threePaneConfig();
		(config.root as SplitConfig).splitPoints = [0.05];
		expect(() => validateConfig(config, views)).toThrow('splitPoints violate minRatio constraints');
		expect(() => validateConfig(config, views, { minWidthRatio: 0.01 })).not.toThrow();
	});

	it('rejects split points closer than the minimum ratio to the far edge', () => {
		const config = threePaneConfig();
		(config.root as SplitConfig).splitPoints = [0.95];
		expect(() => validateConfig(config, views)).toThrow('splitPoints violate minRatio constraints');
	});

	it('checks vertical splits against minHeightRatio', () => {
		const config = threePaneConfig();
		const inner = (config.root as SplitConfig).views[1] as SplitConfig;
		inner.splitPoints = [0.15];
		expect(() => validateConfig(config, views)).toThrow('splitPoints violate minRatio constraints');
		expect(() => validateConfig(config, views, { minHeightRatio: 0.1 })).not.toThrow();
	});

	it.each([
		[[0.3, 0.6], true],
		[[0.4, 0.45], false],
		[[0.6, 0.3], false]
	])('checks consecutive split points %o', (splitPoints, valid) => {
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
		if (valid) expect(() => validateConfig(config, views)).not.toThrow();
		else expect(() => validateConfig(config, views)).toThrow('splitPoints violate minRatio');
	});

	it('rejects a negative activeTabIndex', () => {
		const config: LayoutConfig = { root: { tabs: ['a'], activeTabIndex: -1 } };
		expect(() => validateConfig(config, views)).toThrow('activeTabIndex out of range');
	});

	it('rejects a tab that appears twice in the same group', () => {
		const config: LayoutConfig = { root: { tabs: ['a', 'a'], activeTabIndex: 0 } };
		expect(() => validateConfig(config, views)).toThrow('duplicate tab id "a"');
	});

	it('rejects an unknown tab id in a nested group', () => {
		const config = threePaneConfig();
		const inner = (config.root as SplitConfig).views[1] as SplitConfig;
		(inner.views[1] as TabGroupConfig).tabs = ['missing'];
		expect(() => validateConfig(config, views)).toThrow('unknown tab id "missing"');
	});

	it('accepts known maximizedView and popout ids', () => {
		const config: LayoutConfig = { ...threePaneConfig(), maximizedView: 'a', popouts: ['b', 'c'] };
		expect(() => validateConfig(config, views)).not.toThrow();
	});

	it('rejects unknown maximizedView and popout ids', () => {
		expect(() => validateConfig({ maximizedView: 'x' }, views)).toThrow(
			'unknown maximizedView id "x"'
		);
		expect(() => validateConfig({ popouts: ['y'] }, views)).toThrow('unknown popout id "y"');
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
	});

	it('rejects values that are not objects', () => {
		expect(() => parseLayoutConfig(null)).toThrow('root: expected an object');
		expect(() => parseLayoutConfig('layout')).toThrow('root: expected an object');
	});

	it('rejects an empty tab id', () => {
		expect(() => parseLayoutConfig({ root: { tabs: [''], activeTabIndex: 0 } })).toThrow(
			'config.root.tabs[0]: expected a non-empty string'
		);
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

	it('drops an empty popouts array', () => {
		expect(cloneConfig({ popouts: [] })).toEqual({});
		expect(cloneConfig({})).toEqual({});
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
