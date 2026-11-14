/**
 * The demo's saved state in `localStorage`: the main layout's config, its pages, its theme and
 * its options, read back at startup when the user left `Save to localStorage` on.
 * @module
 */
import type { LayoutConfig } from '#lib/types.js';
import { parseLayoutConfig } from '#lib/utils.js';
import { pageKinds, type DemoPageDef, type PageKind } from './pages.js';
import { ratioFormats, type RatioFormat } from './ratio-formats.js';
import { themes } from './themes.js';

const STORAGE_KEY = 'horizon-layout-demo-state';

/** Everything the demo saves of its main layout. */
export interface DemoState {
	config: LayoutConfig;
	pages: DemoPageDef[];
	theme: string;
	showSplitRatio: boolean;
	disableResizeSplits: boolean;
	disableDragAndDrop: boolean;
	hideTabBar: boolean;
	skipValidation: boolean;
	minWidthRatio: number;
	minHeightRatio: number;
	maxDepth: number;
	ratioFormat: RatioFormat;
}

/** The saved state, or null when there is none, saving is off, or it can't be read. */
export function loadDemoState(): DemoState | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const saved: unknown = JSON.parse(raw);
		if (!isRecord(saved) || saved['persist'] !== true) return null;
		return parseDemoState(saved);
	} catch {
		return null;
	}
}

/**
 * Saves `state`, to be read back by `loadDemoState`. Best-effort: when storage is full or
 * blocked, it warns and the demo goes on unsaved.
 */
export function saveDemoState(state: DemoState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ persist: true, ...state }));
	} catch (error) {
		console.warn('horizon-layout demo: the layout could not be saved', error);
	}
}

/** Forgets the saved state. Best-effort, like `saveDemoState`. */
export function clearDemoState(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch (error) {
		console.warn('horizon-layout demo: the saved layout could not be removed', error);
	}
}

/**
 * The state in `saved`, with the defaults for missing or malformed options, or null when its
 * config or pages can't be used (the nested layout's page must be there).
 */
export function parseDemoState(saved: Record<string, unknown>): DemoState | null {
	let config: LayoutConfig;
	try {
		config = parseLayoutConfig(saved['config']);
	} catch {
		return null;
	}
	const pages = (Array.isArray(saved['pages']) ? (saved['pages'] as unknown[]) : [])
		.filter(isRecord)
		.filter(
			(page) =>
				typeof page['id'] === 'string' && page['id'] !== '' && typeof page['title'] === 'string'
		)
		.map((page): DemoPageDef => ({
			id: page['id'] as string,
			title: page['title'] as string,
			kind: pageKinds.includes(page['kind'] as PageKind) ? (page['kind'] as PageKind) : 'blank',
			persistent: !!page['persistent']
		}));
	if (!pages.some((page) => page.kind === 'nested')) return null;
	const theme = saved['theme'];
	const ratioFormat = saved['ratioFormat'];
	return {
		config,
		pages,
		theme: themes.some((t) => t.id === theme) ? (theme as string) : themes[0]!.id,
		showSplitRatio: saved['showSplitRatio'] === undefined ? true : !!saved['showSplitRatio'],
		disableResizeSplits: !!saved['disableResizeSplits'],
		disableDragAndDrop: !!saved['disableDragAndDrop'],
		hideTabBar: !!saved['hideTabBar'],
		skipValidation: !!saved['skipValidation'],
		minWidthRatio: numberOr(saved['minWidthRatio'], 0.1),
		minHeightRatio: numberOr(saved['minHeightRatio'], 0.2),
		maxDepth: numberOr(saved['maxDepth'], 6),
		ratioFormat:
			typeof ratioFormat === 'string' && ratioFormat in ratioFormats
				? (ratioFormat as RatioFormat)
				: 'percent'
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function numberOr(value: unknown, fallback: number): number {
	return typeof value === 'number' ? value : fallback;
}
