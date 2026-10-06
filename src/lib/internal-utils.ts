import type { DropTarget } from './internal-types.ts';
import type { Modifier } from './types.ts';

export const DEFAULT_MIN_WIDTH_RATIO = 0.1;
export const DEFAULT_MIN_HEIGHT_RATIO = 0.2;

/// rounds a split point to the precision it is stored with, so that values
/// computed with floating-point arithmetic can be compared reliably
export function roundSplitPoint(ratio: number): number {
	return Number(ratio.toFixed(4));
}

/// returns the modifier (ctrl, alt, shift, or a combination of them)
/// associated with the keyboard event, or null if no modifier keys were pressed
export function getModifier(event: KeyboardEvent): Modifier | null {
	if (event.ctrlKey && event.altKey && event.shiftKey) return 'ctrl+alt+shift';
	if (event.altKey && event.shiftKey) return 'alt+shift';
	if (event.ctrlKey && event.shiftKey) return 'ctrl+shift';
	if (event.ctrlKey && event.altKey) return 'ctrl+alt';
	if (event.shiftKey) return 'shift';
	if (event.ctrlKey) return 'ctrl';
	if (event.altKey) return 'alt';
	return null;
}

/// returns 'side' if the target is a side drop target, or 'tab' if it's a tab drop target
export function dropTargetType(target: DropTarget): 'side' | 'tab' {
	return target.side ? 'side' : 'tab';
}
