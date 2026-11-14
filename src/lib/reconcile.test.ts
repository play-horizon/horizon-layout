/**
 * Unit tests of `reconcileConfig`: the target ends equal to the source, keeps its node objects
 * where the source has a node of the same kind at the same place, and shares nothing with it.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { reconcileConfig } from './reconcile.ts';
import type { LayoutConfig, SplitConfig, TabGroupConfig } from './types.ts';

function layout(): LayoutConfig {
	return {
		root: {
			direction: 'horizontal',
			views: [
				{ tabs: ['a', 'b'], activeTabIndex: 0 },
				{
					direction: 'vertical',
					views: [
						{ tabs: ['c'], activeTabIndex: 0 },
						{ tabs: ['d'], activeTabIndex: 0 }
					],
					splitPoints: [0.5]
				}
			],
			splitPoints: [0.4]
		}
	};
}

const rect = { x: 10, y: 20, width: 300, height: 200 };

function child(config: LayoutConfig, ...path: number[]) {
	let node = config.root!;
	for (const index of path) node = (node as SplitConfig).views[index]!;
	return node;
}

describe('reconcileConfig', () => {
	it('keeps every node object when only values change', () => {
		const target = layout();
		const nodes = [child(target), child(target, 0), child(target, 1), child(target, 1, 1)];
		const source = layout();
		(child(source) as SplitConfig).splitPoints = [0.3];
		(child(source, 0) as TabGroupConfig).activeTabIndex = 1;
		(child(source, 1, 1) as TabGroupConfig).tabs.push('e');

		reconcileConfig(target, source);

		expect(target).toEqual(source);
		nodes.forEach((node, i) => {
			const path = [[], [0], [1], [1, 1]][i]!;
			expect(child(target, ...path)).toBe(node);
		});
	});

	it('replaces a node whose kind changed and keeps its siblings', () => {
		const target = layout();
		const first = child(target, 0);
		const source = layout();
		(source.root as SplitConfig).views[1] = { tabs: ['c', 'd'], activeTabIndex: 1 };

		reconcileConfig(target, source);

		expect(target).toEqual(source);
		expect(child(target, 0)).toBe(first);
	});

	it('drops the views a split no longer has, and adds the new ones', () => {
		const target = layout();
		const inner = child(target, 1) as SplitConfig;
		const source = layout();
		const sourceInner = child(source, 1) as SplitConfig;
		sourceInner.views.push({ tabs: ['e'], activeTabIndex: 0 });
		sourceInner.splitPoints = [0.3, 0.6];

		reconcileConfig(target, source);
		expect(target).toEqual(source);
		expect(child(target, 1)).toBe(inner);

		reconcileConfig(target, layout());
		expect(target).toEqual(layout());
		expect(inner.views).toHaveLength(2);
	});

	it('copies the root, the maximized view and the popouts', () => {
		const target: LayoutConfig = {};
		const source: LayoutConfig = { ...layout(), maximizedView: 'a', popouts: ['e'] };

		reconcileConfig(target, source);
		expect(target).toEqual(source);

		reconcileConfig(target, {});
		expect(target).toEqual({});
	});

	it('shares no object with the source', () => {
		const target: LayoutConfig = { root: { tabs: ['a'], activeTabIndex: 0 } };
		const source = layout();

		reconcileConfig(target, source);
		(child(source, 0) as TabGroupConfig).tabs.push('z');
		source.popouts = ['y'];

		expect(target).toEqual(layout());
	});

	it('keeps the floating group holding the same views, and drops the others', () => {
		const target: LayoutConfig = {
			floating: [
				{ tabs: ['a'], activeTabIndex: 0, rect },
				{ tabs: ['b'], activeTabIndex: 0, rect }
			]
		};
		const first = target.floating![0]!;
		const source: LayoutConfig = {
			floating: [{ tabs: ['a', 'c'], activeTabIndex: 1, rect: { ...rect, x: 50 } }]
		};

		reconcileConfig(target, source);
		expect(target).toEqual(source);
		expect(target.floating![0]).toBe(first);

		reconcileConfig(target, {});
		expect(target.floating).toBeUndefined();
	});

	it('keeps the nodes after a removed sibling, matching them by their views', () => {
		const target: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 },
					{ tabs: ['c'], activeTabIndex: 0 }
				],
				splitPoints: [0.3, 0.6]
			},
			floating: [
				{ tabs: ['d'], activeTabIndex: 0, rect },
				{ tabs: ['e'], activeTabIndex: 0, rect }
			]
		};
		const [b, c] = [child(target, 1), child(target, 2)];
		const e = target.floating![1]!;
		const source: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['b'], activeTabIndex: 0 },
					{ tabs: ['c', 'f'], activeTabIndex: 1 }
				],
				splitPoints: [0.5]
			},
			floating: [{ tabs: ['e'], activeTabIndex: 0, rect: { ...rect, y: 99 } }]
		};

		reconcileConfig(target, source);

		expect(target).toEqual(source);
		expect(child(target, 0)).toBe(b);
		expect(child(target, 1)).toBe(c);
		expect(target.floating![0]).toBe(e);
	});

	it('prefers, among groups holding the same views, the one showing the same view', () => {
		const target: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a', 'b'], activeTabIndex: 0 },
					{ tabs: ['c', 'd'], activeTabIndex: 1 }
				],
				splitPoints: [0.5]
			}
		};
		const showingD = child(target, 1);
		const source: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a', 'c'], activeTabIndex: 0 },
					{ tabs: ['b', 'd'], activeTabIndex: 1 }
				],
				splitPoints: [0.5]
			}
		};

		reconcileConfig(target, source);

		expect(target).toEqual(source);
		expect(child(target, 1)).toBe(showingD);
	});

	it('keeps a group for the view it shows when an inactive tab is split out before it', () => {
		const target: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a', 'b'], activeTabIndex: 1 },
					{ tabs: ['c'], activeTabIndex: 0 }
				],
				splitPoints: [0.5]
			}
		};
		const [showingB, c] = [child(target, 0), child(target, 1)];
		const source: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 },
					{ tabs: ['c'], activeTabIndex: 0 }
				],
				splitPoints: [0.25, 0.5]
			}
		};

		reconcileConfig(target, source);

		expect(target).toEqual(source);
		expect(child(target, 1)).toBe(showingB);
		expect(child(target, 2)).toBe(c);
	});
});
