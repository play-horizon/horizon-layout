/**
 * Unit tests of the floating-group geometry: where a group is shown inside the layout, and how
 * moving and resizing change its rectangle. Every expected rectangle is worked out by hand.
 * @module
 */
import { describe, expect, it } from 'vitest';
import {
	clampFloatingRect,
	moveFloatingGroup,
	resizedRect,
	resizeFloatingGroup
} from './floating.ts';
import type { FloatingGroupConfig } from './types.ts';

const bounds = { width: 1000, height: 800 };

function group(x: number, y: number, width: number, height: number): FloatingGroupConfig {
	return { tabs: ['a'], activeTabIndex: 0, rect: { x, y, width, height } };
}

describe('clampFloatingRect', () => {
	it('keeps a rectangle that fits', () => {
		expect(clampFloatingRect({ x: 10, y: 20, width: 300, height: 200 }, bounds)).toEqual({
			x: 10,
			y: 20,
			width: 300,
			height: 200
		});
	});

	it('moves a rectangle back inside the layout', () => {
		expect(clampFloatingRect({ x: 900, y: -20, width: 300, height: 200 }, bounds)).toEqual({
			x: 700,
			y: 0,
			width: 300,
			height: 200
		});
	});

	it('shrinks a rectangle larger than the layout, and grows one below the minimum', () => {
		expect(clampFloatingRect({ x: 50, y: 50, width: 1200, height: 10 }, bounds)).toEqual({
			x: 0,
			y: 50,
			width: 1000,
			height: 96
		});
	});

	it('lets a layout smaller than the minimum win', () => {
		expect(
			clampFloatingRect({ x: 5, y: 5, width: 300, height: 200 }, { width: 100, height: 50 })
		).toEqual({ x: 0, y: 0, width: 100, height: 50 });
	});

	it('only rounds and applies the minimum while the layout is unmeasured', () => {
		expect(
			clampFloatingRect({ x: -40.4, y: 2000.6, width: 20, height: 300.2 }, { width: 0, height: 0 })
		).toEqual({ x: -40, y: 2001, width: 160, height: 300 });
	});
});

describe('moveFloatingGroup', () => {
	it('moves from where the group is shown, and stops at the layout edge', () => {
		const floating = group(900, 10, 300, 200);
		moveFloatingGroup(floating, 50, 30, bounds);
		expect(floating.rect).toEqual({ x: 700, y: 40, width: 300, height: 200 });

		moveFloatingGroup(floating, -10, 0, bounds);
		expect(floating.rect).toEqual({ x: 690, y: 40, width: 300, height: 200 });
	});

	it('leaves the rect object alone when nothing changes', () => {
		const floating = group(0, 0, 300, 200);
		const before = floating.rect;
		moveFloatingGroup(floating, -10, -10, bounds);
		expect(floating.rect).toBe(before);
	});
});

describe('resizeFloatingGroup', () => {
	it('grows and shrinks from the bottom-right corner, between the minimum and the layout', () => {
		const floating = group(600, 500, 300, 200);
		resizeFloatingGroup(floating, 50, -10, bounds);
		expect(floating.rect).toEqual({ x: 600, y: 500, width: 350, height: 190 });

		resizeFloatingGroup(floating, 500, 500, bounds);
		expect(floating.rect).toEqual({ x: 600, y: 500, width: 400, height: 300 });

		resizeFloatingGroup(floating, -1000, -1000, bounds);
		expect(floating.rect).toEqual({ x: 600, y: 500, width: 160, height: 96 });
	});
});

describe('resizedRect', () => {
	const start = { x: 100, y: 100, width: 300, height: 200 };

	it('moves the left and top edges, keeping the right and bottom ones', () => {
		expect(resizedRect(start, 'nw', -30, 40, bounds)).toEqual({
			x: 70,
			y: 140,
			width: 330,
			height: 160
		});
	});

	it('stops the left edge at the minimum width and at the layout edge', () => {
		expect(resizedRect(start, 'w', 250, 0, bounds)).toEqual({
			x: 240,
			y: 100,
			width: 160,
			height: 200
		});
		expect(resizedRect(start, 'w', -500, 0, bounds)).toEqual({
			x: 0,
			y: 100,
			width: 400,
			height: 200
		});
	});

	it('moves only the axis of a side edge', () => {
		expect(resizedRect(start, 's', 99, 50, bounds)).toEqual({
			x: 100,
			y: 100,
			width: 300,
			height: 250
		});
		expect(resizedRect(start, 'e', 1000, 50, bounds)).toEqual({
			x: 100,
			y: 100,
			width: 900,
			height: 200
		});
	});
});
