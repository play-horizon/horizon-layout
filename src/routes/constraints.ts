/**
 * The default and the range the demo accepts for each layout constraint, shared by the sidebar's
 * fields (`ConstraintOptions.svelte`) and the state read back from storage (`persistence.ts`).
 * @module
 */

/** The largest minimum pane size, as a ratio of its split (the library accepts up to 0.5). */
export const MAX_MIN_RATIO = 0.45;

/** The smallest `maxDepth`. */
export const MIN_DEPTH = 1;

/** The largest `maxDepth`. */
export const MAX_DEPTH = 10;

/** The constraints the demo starts with, and goes back to with its layout ("Reset layout"). */
export const DEFAULT_CONSTRAINTS = {
	minWidthRatio: 0.1,
	minHeightRatio: 0.2,
	maxDepth: 6
} as const;
