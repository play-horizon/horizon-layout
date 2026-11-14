/**
 * The demo's pages (the views of the main layout) and the layout it starts with: the pages
 * `Reset layout` brings back, and how the ones the user adds are numbered.
 * @module
 */
import type { Id, LayoutConfig } from '#lib/types.js';
import type { PageKind as DemoPageKind } from './DemoPage.svelte';

/** What a page shows: one of `DemoPage`'s kinds, or the nested layout (`NestedDemo`). */
export type PageKind = DemoPageKind | 'nested';

/** Every page kind, to check the ones read back from storage. */
export const pageKinds: readonly PageKind[] = [
	'intro',
	'usage',
	'files',
	'config',
	'floating',
	'blank',
	'nested'
];

/** A page of the main layout: its view id, tab title and content. */
export interface DemoPageDef {
	id: Id;
	title: string;
	kind: PageKind;
	/** A persistent page can't be closed or removed. */
	persistent?: boolean;
}

/** The pages the demo starts with. */
export function defaultPages(): DemoPageDef[] {
	return [
		{ id: 'intro', title: 'Getting started', kind: 'intro', persistent: true },
		{ id: 'usage', title: 'Usage', kind: 'usage' },
		{ id: 'files', title: 'Files', kind: 'files' },
		{ id: 'config', title: 'Config', kind: 'config' },
		{ id: 'floating', title: 'Floating panel', kind: 'floating' },
		{ id: 'nested', title: 'Nested layout', kind: 'nested', persistent: true }
	];
}

/** The layout the demo starts with, showing every page of `defaultPages`. */
export function defaultConfig(): LayoutConfig {
	return {
		root: {
			direction: 'horizontal',
			views: [
				{ tabs: ['intro', 'usage'], activeTabIndex: 0 },
				{
					direction: 'vertical',
					views: [
						{ tabs: ['files'], activeTabIndex: 0 },
						{ tabs: ['config'], activeTabIndex: 0 }
					],
					splitPoints: [0.4]
				},
				{ tabs: ['nested'], activeTabIndex: 0 }
			],
			splitPoints: [0.3, 0.55]
		},
		floating: [
			{
				tabs: ['floating'],
				activeTabIndex: 0,
				rect: { x: 320, y: 140, width: 380, height: 260 }
			}
		]
	};
}

/** Highest `page-N` number already in use, or 0 when none exist. */
export function highestPageNumber(pages: readonly { id: string }[]): number {
	let highest = 0;
	for (const page of pages) {
		const digits = /^page-(\d+)$/.exec(page.id)?.[1];
		if (digits === undefined) continue;
		highest = Math.max(highest, Number(digits));
	}
	return highest;
}
