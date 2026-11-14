/**
 * Small helpers and defaults shared by the library's components and its public utilities:
 * split-point rounding, matching keyboard controls and drop targets. Internal to the library.
 * @module
 */
import type { DropTarget } from './internal-types.ts';
import type { KeyboardControl, Modifier, NodeConfig, SplitConfig } from './types.ts';

/** The default minimum width of a pane, as a fraction of its horizontal split. */
export const DEFAULT_MIN_WIDTH_RATIO = 0.1;
/** The default minimum height of a pane, as a fraction of its vertical split. */
export const DEFAULT_MIN_HEIGHT_RATIO = 0.2;
/** The default deepest docked layout, counted in tab groups (a lone tab group is 1 deep). */
export const DEFAULT_MAX_DEPTH = 6;

/**
 * Rounds a split point to the precision it is stored with (4 decimals), so that values computed
 * with floating-point arithmetic can be compared reliably.
 */
export function roundSplitPoint(ratio: number): number {
	return Number(ratio.toFixed(4));
}

/**
 * Rounds every split point under `node` to the stored precision, in place, so that every bound
 * the layout reasons about is a multiple of 0.0001.
 */
export function roundSplitPoints(node: NodeConfig): void {
	if (!('splitPoints' in node)) return;
	node.splitPoints = node.splitPoints.map(roundSplitPoint) as SplitConfig['splitPoints'];
	for (const child of node.views) roundSplitPoints(child);
}

/**
 * Returns the control one of whose shortcuts is the key of `event` with exactly its modifiers,
 * or undefined. A key pressed with Meta (Command) matches nothing: those chords belong to the
 * browser and the system (Command + Left goes back, on macOS).
 */
export function findControl<T>(
	controls: readonly KeyboardControl<T>[],
	event: KeyboardEvent
): KeyboardControl<T> | undefined {
	if (event.metaKey) return undefined;
	const modifier = getModifier(event);
	return controls.find((control) =>
		control.shortcuts.some(
			(shortcut) => modifier === (shortcut.modifier ?? null) && event.key === shortcut.key
		)
	);
}

/**
 * Returns the modifier (ctrl, alt, shift, or a combination of them) held during the keyboard
 * event, or null if none of them is held.
 */
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

/** Returns 'side' if the target is a side drop target, or 'tab' if it's a tab drop target. */
export function dropTargetType(target: DropTarget): 'side' | 'tab' {
	return target.side ? 'side' : 'tab';
}
