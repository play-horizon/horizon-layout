import { describe, expect, it } from 'vitest';
import { dropTargetType, getModifier } from './internal-utils.ts';

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
