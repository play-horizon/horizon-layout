import { describe, expect, it } from 'vitest';
import { dropTargetType, getModifier, roundSplitPoint } from './internal-utils.ts';

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
