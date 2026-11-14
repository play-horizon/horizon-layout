/**
 * Unit tests of the internal helpers: keyboard modifiers, drop target kinds and split-point
 * rounding.
 * @module
 */
import { describe, expect, it } from 'vitest';
import {
	dropTargetType,
	findControl,
	getModifier,
	roundSplitPoint,
	roundSplitPoints
} from './internal-utils.ts';
import type { KeyboardControl, NodeConfig } from './types.ts';

describe('getModifier', () => {
	it.each([
		[{}, null],
		[{ ctrlKey: true }, 'ctrl'],
		[{ altKey: true }, 'alt'],
		[{ shiftKey: true }, 'shift'],
		[{ ctrlKey: true, altKey: true }, 'ctrl+alt'],
		[{ ctrlKey: true, shiftKey: true }, 'ctrl+shift'],
		[{ altKey: true, shiftKey: true }, 'alt+shift'],
		[{ ctrlKey: true, altKey: true, shiftKey: true }, 'ctrl+alt+shift']
	])('maps %o to %s', (keys, modifier) => {
		const event = { ctrlKey: false, altKey: false, shiftKey: false, ...keys } as KeyboardEvent;
		expect(getModifier(event)).toBe(modifier);
	});
});

describe('findControl', () => {
	const plain: KeyboardControl<null> = { shortcuts: [{ key: 'ArrowLeft' }], action: () => {} };
	const ctrl: KeyboardControl<null> = {
		shortcuts: [{ key: 'Home' }, { modifier: 'ctrl', key: 'ArrowLeft' }],
		action: () => {}
	};
	const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

	it('finds the control with the key and exactly its modifiers', () => {
		expect(findControl([plain, ctrl], key({ key: 'ArrowLeft' }))).toBe(plain);
		expect(findControl([plain, ctrl], key({ key: 'ArrowLeft', ctrlKey: true }))).toBe(ctrl);
		expect(findControl([plain, ctrl], key({ key: 'Home' }))).toBe(ctrl);
		expect(findControl([plain, ctrl], key({ key: 'ArrowLeft', shiftKey: true }))).toBeUndefined();
	});

	it('matches nothing while Meta is held', () => {
		expect(findControl([plain, ctrl], key({ key: 'ArrowLeft', metaKey: true }))).toBeUndefined();
		expect(
			findControl([plain, ctrl], key({ key: 'ArrowLeft', metaKey: true, ctrlKey: true }))
		).toBeUndefined();
	});
});

describe('dropTargetType', () => {
	it('tells side and tab drop targets apart', () => {
		expect(dropTargetType({ side: 'left' })).toBe('side');
		expect(dropTargetType({ tabIndex: 0 })).toBe('tab');
	});
});

describe('roundSplitPoint', () => {
	it('rounds to 4 decimals', () => {
		expect(roundSplitPoint(0.2 + 0.1)).toBe(0.3);
		expect(roundSplitPoint(1 / 3)).toBe(0.3333);
		expect(roundSplitPoint(0.66666)).toBe(0.6667);
	});
});

describe('roundSplitPoints', () => {
	it('rounds every split point of a tree, in place', () => {
		const tree: NodeConfig = {
			direction: 'horizontal',
			views: [
				{ tabs: ['a'], activeTabIndex: 0 },
				{
					direction: 'vertical',
					views: [
						{ tabs: ['b'], activeTabIndex: 0 },
						{ tabs: ['c'], activeTabIndex: 0 }
					],
					splitPoints: [0.66666]
				}
			],
			splitPoints: [0.30001]
		};
		roundSplitPoints(tree);
		expect(tree.splitPoints).toEqual([0.3]);
		expect((tree.views[1] as { splitPoints: number[] }).splitPoints).toEqual([0.6667]);
	});
});
