/**
 * The geometry of floating groups: where a floating group is shown inside the layout's box, and
 * how moving and resizing change its rectangle. Pure functions, used by `FloatingGroup.svelte`
 * for the pointer and by the default keyboard controls, and exported for custom controls.
 * @module
 */
import type { FloatingGroupConfig, FloatingRect, Size } from './types.ts';

/** The smallest width, in CSS pixels, a floating group is shown or resized to. */
export const FLOATING_MIN_WIDTH = 160;
/** The smallest height, in CSS pixels, a floating group is shown or resized to. */
export const FLOATING_MIN_HEIGHT = 96;

/** An edge or a corner of a floating group, by compass direction, for resizing. */
export type ResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

/**
 * Returns the rectangle a floating group is shown at inside a layout of size `bounds`: its size
 * kept between the minimum and the layout's size (the layout wins when it is smaller than the
 * minimum), then its position moved so the whole group is inside the layout. Values are rounded
 * to whole pixels. A `bounds` of zero width or height means the layout hasn't been measured yet:
 * that axis is only rounded and kept at least the minimum.
 *
 * @example
 * clampFloatingRect({ x: 900, y: -20, width: 300, height: 200 }, { width: 1000, height: 800 });
 * // { x: 700, y: 0, width: 300, height: 200 }
 */
export function clampFloatingRect(rect: FloatingRect, bounds: Size): FloatingRect {
	const [x, width] = clampAxis(rect.x, rect.width, FLOATING_MIN_WIDTH, bounds.width);
	const [y, height] = clampAxis(rect.y, rect.height, FLOATING_MIN_HEIGHT, bounds.height);
	return { x, y, width, height };
}

/**
 * Moves a floating group by `dx`, `dy` pixels from where it is shown, keeping it inside `bounds`.
 * Changes `group.rect` only when the result differs.
 */
export function moveFloatingGroup(
	group: FloatingGroupConfig,
	dx: number,
	dy: number,
	bounds: Size
): void {
	const shown = clampFloatingRect(group.rect, bounds);
	setRect(group, clampFloatingRect({ ...shown, x: shown.x + dx, y: shown.y + dy }, bounds));
}

/**
 * Resizes a floating group by `dw`, `dh` pixels from its shown size, keeping its top-left corner
 * and keeping it inside `bounds` and at least the minimum size. Changes `group.rect` only when
 * the result differs.
 */
export function resizeFloatingGroup(
	group: FloatingGroupConfig,
	dw: number,
	dh: number,
	bounds: Size
): void {
	setRect(group, resizedRect(clampFloatingRect(group.rect, bounds), 'se', dw, dh, bounds));
}

/**
 * Returns `start` resized by dragging its `edge` by `dx`, `dy` pixels: the opposite edges stay
 * where they are, and the size stays at least the minimum and inside `bounds`.
 */
export function resizedRect(
	start: FloatingRect,
	edge: ResizeEdge,
	dx: number,
	dy: number,
	bounds: Size
): FloatingRect {
	const [x, width] = resizeAxis(
		start.x,
		start.width,
		edge.includes('w') ? 'start' : edge.includes('e') ? 'end' : null,
		dx,
		FLOATING_MIN_WIDTH,
		bounds.width
	);
	const [y, height] = resizeAxis(
		start.y,
		start.height,
		edge.includes('n') ? 'start' : edge.includes('s') ? 'end' : null,
		dy,
		FLOATING_MIN_HEIGHT,
		bounds.height
	);
	return clampFloatingRect({ x, y, width, height }, bounds);
}

/** One axis of `resizedRect`: moves the start or the end side by `delta`, or neither. */
function resizeAxis(
	position: number,
	length: number,
	side: 'start' | 'end' | null,
	delta: number,
	min: number,
	bound: number
): [number, number] {
	const end = position + length;
	if (side === 'end') {
		const limit = bound > 0 ? bound : Infinity;
		return [position, Math.min(Math.max(length + delta, min), limit - position)];
	}
	if (side === 'start') {
		const start = Math.max(Math.min(position + delta, end - min), 0);
		return [start, end - start];
	}
	return [position, length];
}

/** One axis of `clampFloatingRect`. */
function clampAxis(position: number, length: number, min: number, bound: number): [number, number] {
	if (bound <= 0) return [Math.round(position), Math.round(Math.max(length, min))];
	const size = Math.round(Math.min(Math.max(length, Math.min(min, bound)), bound));
	return [Math.round(Math.min(Math.max(position, 0), bound - size)), size];
}

function setRect(group: FloatingGroupConfig, rect: FloatingRect): void {
	const { x, y, width, height } = group.rect;
	if (x !== rect.x || y !== rect.y || width !== rect.width || height !== rect.height) {
		group.rect = rect;
	}
}
