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
});
