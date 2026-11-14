/**
 * Unit tests of the demo's docking of a floating group at the end of the layout (`dock.ts`).
 * @module
 */
import { describe, expect, it } from 'vitest';
import type { FloatingGroupConfig, LayoutConfig } from '#lib/types.js';
import { dockAtEnd, floatingGroupOf } from './dock.js';

const rect = { x: 0, y: 0, width: 300, height: 200 };

function floating(tabs: [string, ...string[]], activeTabIndex: number): FloatingGroupConfig {
	return { tabs, activeTabIndex, rect };
}

describe('docking a floating group', () => {
	it('appends its tabs to the last docked group, its active tab active', () => {
		const config: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b', 'c'], activeTabIndex: 0 }
				],
				splitPoints: [0.5]
			},
			floating: [floating(['d', 'e'], 1), floating(['f'], 0)]
		};
		dockAtEnd(config, config.floating![0]!);

		expect(config).toEqual({
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b', 'c', 'd', 'e'], activeTabIndex: 3 }
				],
				splitPoints: [0.5]
			},
			floating: [floating(['f'], 0)]
		});
	});

	it('makes its tabs the docked layout when nothing is docked, and drops an empty floating list', () => {
		const config: LayoutConfig = { floating: [floating(['d', 'e'], 1)], popouts: ['p'] };
		dockAtEnd(config, config.floating![0]!);

		expect(config).toEqual({ root: { tabs: ['d', 'e'], activeTabIndex: 1 }, popouts: ['p'] });
	});

	it('finds the floating group of a view, and nothing for a docked one', () => {
		const group = floating(['d'], 0);
		const config: LayoutConfig = { root: { tabs: ['a'], activeTabIndex: 0 }, floating: [group] };

		expect(floatingGroupOf(config, 'd')).toBe(group);
		expect(floatingGroupOf(config, 'a')).toBeUndefined();
	});
});
