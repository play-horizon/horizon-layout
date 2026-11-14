/**
 * Component tests of HorizonLayout, rendered in jsdom through `LayoutHarness` (src/test): what it
 * renders, its accessible names (English by default, or the translations passed), how it applies
 * config changes and rejects invalid ones, and its built-in keyboard controls on docked tab groups
 * and split handles, focus following moved tabs.
 * @module
 */
import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, flushSync, tick } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDataTransfer } from '../test/drag.ts';
import LayoutHarness from '../test/LayoutHarness.svelte';
import HorizonLayout from './HorizonLayout.svelte';
import { englishTranslations } from './translations.ts';
import { mounts } from '../test/ViewBody.svelte';
import { removeView, validateConfig } from './utils.ts';
import type {
	Id,
	KeyboardControls,
	LayoutConfig,
	LayoutTranslations,
	SplitConfig,
	TabGroupConfig,
	View
} from './types.ts';

function twoPanes(): LayoutConfig {
	return {
		root: {
			direction: 'horizontal',
			views: [
				{ tabs: ['a', 'b'], activeTabIndex: 0 },
				{ tabs: ['c'], activeTabIndex: 0 }
			],
			splitPoints: [0.5]
		}
	};
}

/** Renders the harness with a config held in `$state`, and returns it. */
function renderLayout(initial: LayoutConfig, keyboardControls?: KeyboardControls) {
	const state = $state({ config: initial });
	render(LayoutHarness, {
		props: {
			get config() {
				return state.config;
			},
			set config(value) {
				state.config = value;
			},
			ids: ['a', 'b', 'c', 'd'],
			keyboardControls
		}
	});
	return state;
}

beforeEach(() => mounts.clear());
afterEach(() => vi.restoreAllMocks());

describe('HorizonLayout', () => {
	it('renders the active tab of each group', () => {
		renderLayout(twoPanes());
		expect(screen.getByText('Body of a')).toBeTruthy();
		expect(screen.getByText('Body of c')).toBeTruthy();
		expect(screen.queryByText('Body of b')).toBeNull();
		expect(screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())).toEqual([
			'Title of a',
			'Title of b',
			'Title of c'
		]);
	});

	it('names the resize handles with the translations', () => {
		renderLayout(twoPanes());
		expect(screen.getByRole('slider').getAttribute('aria-label')).toBe('Resize pane 1');
	});

	it('shows a maximized view alone, in a region named by its title', () => {
		renderLayout({ ...twoPanes(), maximizedView: 'c' });
		const region = screen.getByRole('region', { name: 'Title of c' });
		expect(region.textContent?.trim()).toBe('Body of c');
		expect(screen.queryByRole('tablist')).toBeNull();
	});

	it('keeps the panels whose place is unchanged mounted when the config changes outside', () => {
		const state = renderLayout(twoPanes());
		const second = (state.config.root as SplitConfig).views[1] as TabGroupConfig;
		second.tabs.push('d');
		second.activeTabIndex = 1;
		flushSync();
		expect(screen.getByText('Body of d')).toBeTruthy();
		expect(mounts.get('a')).toBe(1);
	});

	it('keeps the panels mounted when the config is replaced by an equal-shaped one', () => {
		const state = renderLayout(twoPanes());
		const next = twoPanes();
		(next.root as SplitConfig).splitPoints = [0.3];
		state.config = next;
		flushSync();
		expect(mounts.get('a')).toBe(1);
		expect(mounts.get('c')).toBe(1);
	});

	it('keeps the built-in controls of a category the keyboard controls leave out', async () => {
		const state = renderLayout(twoPanes(), { splitControls: [] });
		const [tabList] = screen.getAllByRole('tablist');
		await fireEvent.keyDown(tabList!, { key: 'ArrowRight' });
		expect(((state.config.root as SplitConfig).views[0] as TabGroupConfig).activeTabIndex).toBe(1);

		await fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
		expect((state.config.root as SplitConfig).splitPoints).toEqual([0.5]);
	});

	it('renders nothing for an invalid config, logging why, until a valid one comes', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const state = renderLayout({ root: { tabs: ['a', 'z'], activeTabIndex: 0 } });

		expect(screen.queryByRole('tablist')).toBeNull();
		expect(error).toHaveBeenCalledWith('HorizonLayout: config.root.tabs[1]: unknown view id "z"');

		state.config = twoPanes();
		flushSync();
		expect(screen.getAllByRole('tablist')).toHaveLength(2);
	});
	it('renders nothing for a config of the wrong shape, logging why, without throwing', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const malformed = { ...twoPanes() };
		(malformed.root as { splitPoints: unknown }).splitPoints = null;

		renderLayout(malformed);

		expect(screen.queryByRole('tablist')).toBeNull();
		expect(error).toHaveBeenCalledOnce();
	});

	it('validates the config again when the minimum ratios tighten', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const props = $state({ config: twoPanes(), minWidthRatio: 0.1 });
		(props.config.root as SplitConfig).splitPoints = [0.3];
		render(LayoutHarness, {
			props: {
				get config() {
					return props.config;
				},
				set config(value) {
					props.config = value;
				},
				get minWidthRatio() {
					return props.minWidthRatio;
				},
				ids: ['a', 'b', 'c', 'd']
			}
		});
		expect(screen.getAllByRole('tablist')).toHaveLength(2);

		props.minWidthRatio = 0.4;
		flushSync();
		expect(screen.queryByRole('tablist')).toBeNull();
		expect(error).toHaveBeenCalledWith(
			'HorizonLayout: config.root.splitPoints[0]: leaves a pane smaller than the minimum ratio'
		);
	});
});

/** Presses `key` (with `modifiers`) on the tab list of the docked group at `index`. */
async function pressOnTabList(index: number, key: string, modifiers: KeyboardEventInit = {}) {
	await fireEvent.keyDown(screen.getAllByRole('tablist')[index]!, { key, ...modifiers });
	await tick();
}

function rootOf(state: { config: LayoutConfig }) {
	return state.config.root as SplitConfig;
}

describe('the built-in tab group controls', () => {
	it('select the next and previous tab, wrapping, and the first and last', async () => {
		const state = renderLayout(twoPanes());
		const group = () => rootOf(state).views[0] as TabGroupConfig;

		await pressOnTabList(0, 'ArrowLeft');
		expect(group().activeTabIndex).toBe(1);
		await pressOnTabList(0, 'ArrowDown');
		expect(group().activeTabIndex).toBe(0);
		await pressOnTabList(0, 'End');
		expect(group().activeTabIndex).toBe(1);
		await pressOnTabList(0, 'Home');
		expect(group().activeTabIndex).toBe(0);
	});

	it('reorder the active tab with Shift', async () => {
		const state = renderLayout(twoPanes());

		await pressOnTabList(0, 'ArrowRight', { shiftKey: true });
		expect(rootOf(state).views[0]).toEqual({ tabs: ['b', 'a'], activeTabIndex: 1 });
		await pressOnTabList(0, 'Home', { shiftKey: true });
		expect(rootOf(state).views[0]).toEqual({ tabs: ['a', 'b'], activeTabIndex: 0 });
	});

	it('move the active tab to the group on that side with Ctrl+Arrow, focus following', async () => {
		const state = renderLayout(twoPanes());

		await pressOnTabList(0, 'ArrowRight', { ctrlKey: true });
		await tick();

		expect(rootOf(state).views).toEqual([
			{ tabs: ['b'], activeTabIndex: 0 },
			{ tabs: ['c', 'a'], activeTabIndex: 1 }
		]);
		expect(document.activeElement).toBe(screen.getAllByRole('tablist')[1]);
	});

	it('do nothing with Ctrl+Arrow towards a side with no group', async () => {
		const state = renderLayout(twoPanes());
		await pressOnTabList(0, 'ArrowLeft', { ctrlKey: true });
		await pressOnTabList(0, 'ArrowUp', { ctrlKey: true });
		expect(state.config).toEqual(twoPanes());
	});

	it('move the active tab to the first group with Ctrl+Home, removing the group it empties', async () => {
		const state = renderLayout(twoPanes());

		await pressOnTabList(1, 'Home', { ctrlKey: true });
		await tick();

		expect(state.config.root).toEqual({ tabs: ['a', 'b', 'c'], activeTabIndex: 2 });
		expect(document.activeElement).toBe(screen.getByRole('tablist'));
	});

	it('split the active tab out into the split it is in with Alt+Arrow, halving the group', async () => {
		const state = renderLayout(twoPanes());

		await pressOnTabList(0, 'ArrowRight', { altKey: true });
		await tick();

		expect(state.config.root).toEqual({
			direction: 'horizontal',
			views: [
				{ tabs: ['b'], activeTabIndex: 0 },
				{ tabs: ['a'], activeTabIndex: 0 },
				{ tabs: ['c'], activeTabIndex: 0 }
			],
			splitPoints: [0.25, 0.5]
		});
		expect(document.activeElement).toBe(screen.getAllByRole('tablist')[1]);
	});

	it('split the active tab out into a new nested split along the other axis', async () => {
		const state = renderLayout(twoPanes());

		await pressOnTabList(0, 'ArrowUp', { altKey: true });
		await tick();

		expect(rootOf(state).views[0]).toEqual({
			direction: 'vertical',
			views: [
				{ tabs: ['a'], activeTabIndex: 0 },
				{ tabs: ['b'], activeTabIndex: 0 }
			],
			splitPoints: [0.5]
		});
		expect(document.activeElement).toBe(screen.getAllByRole('tablist')[0]);
	});

	it('don’t split a group with a single tab', async () => {
		const state = renderLayout(twoPanes());
		await pressOnTabList(1, 'ArrowLeft', { altKey: true });
		expect(state.config).toEqual(twoPanes());
	});
});

describe('the built-in split handle controls', () => {
	it('move the handle by 1 %, 10 % with Shift, and to its limits with Home and End', async () => {
		const state = renderLayout(twoPanes());
		const handle = screen.getByRole('slider');

		await fireEvent.keyDown(handle, { key: 'ArrowRight' });
		expect(rootOf(state).splitPoints).toEqual([0.51]);
		await fireEvent.keyDown(handle, { key: 'ArrowUp', shiftKey: true });
		expect(rootOf(state).splitPoints).toEqual([0.41]);
		await fireEvent.keyDown(handle, { key: 'End' });
		expect(rootOf(state).splitPoints).toEqual([0.9]);
		await fireEvent.keyDown(handle, { key: 'Home' });
		expect(rootOf(state).splitPoints).toEqual([0.1]);
	});
});

describe('outside changes', () => {
	it('keep the panels after a removed pane or floating group mounted', () => {
		const state = $state({
			config: {
				root: {
					direction: 'horizontal',
					views: [
						{ tabs: ['a'], activeTabIndex: 0 },
						{ tabs: ['b'], activeTabIndex: 0 },
						{ tabs: ['c'], activeTabIndex: 0 }
					],
					splitPoints: [0.3, 0.6]
				},
				floating: [
					{ tabs: ['d'], activeTabIndex: 0, rect: { x: 0, y: 0, width: 200, height: 200 } },
					{ tabs: ['e'], activeTabIndex: 0, rect: { x: 50, y: 50, width: 200, height: 200 } }
				]
			} as LayoutConfig
		});
		render(LayoutHarness, {
			props: {
				get config() {
					return state.config;
				},
				set config(value) {
					state.config = value;
				},
				ids: ['a', 'b', 'c', 'd', 'e']
			}
		});

		removeView(state.config, 'a');
		removeView(state.config, 'd');
		flushSync();

		expect(screen.queryByText('Body of a')).toBeNull();
		expect(Object.fromEntries(mounts)).toEqual({ a: 1, b: 1, c: 1, d: 1, e: 1 });
	});
});

describe('translations', () => {
	/**
	 * Renders a split of two views, with a floating group, given
	 * `translations` when defined, and returns every text the layout writes.
	 */
	function renderTexts(translations?: Partial<LayoutTranslations>) {
		const snippet = createRawSnippet(() => ({ render: () => '<p>Body</p>' }));
		const views = new SvelteMap<Id, View>([
			['a', { title: 'Files', snippet }],
			['b', { title: 'Docs', snippet }],
			['c', { title: 'Search', snippet }]
		]);
		const config: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 }
				],
				splitPoints: [0.5]
			},
			floating: [{ tabs: ['c'], activeTabIndex: 0, rect: { x: 0, y: 0, width: 300, height: 200 } }]
		};
		render(HorizonLayout, {
			props: translations === undefined ? { config, views } : { config, views, translations }
		});
		return {
			separator: screen.getByRole('slider').getAttribute('aria-label'),
			tabLists: screen.getAllByRole('tablist').map((list) => list.getAttribute('aria-label')),
			floatingPanel: screen.getByRole('dialog').getAttribute('aria-label')
		};
	}

	it('are English when none are passed', () => {
		expect(renderTexts()).toEqual({
			separator: 'Resize pane 1',
			tabLists: ['Tabs, Files shown', 'Tabs, Docs shown', 'Tabs, Search shown'],
			floatingPanel: 'Search, floating panel'
		});
	});

	it('take the keys passed, the others staying English', () => {
		expect(
			renderTexts({ resizePane: (pane) => `Redimensionner le panneau ${pane}`, tabList: undefined })
		).toEqual({
			separator: 'Redimensionner le panneau 1',
			tabLists: ['Tabs, Files shown', 'Tabs, Docs shown', 'Tabs, Search shown'],
			floatingPanel: 'Search, floating panel'
		});
	});

	it('are used as they are when every key is passed', () => {
		const french: LayoutTranslations = {
			resizePane: (pane) => `Redimensionner le panneau ${pane}`,
			floatingPanel: (title) => `${title}, panneau flottant`,
			tabList: (title) => `Onglets, ${title} affiché`
		};
		expect(renderTexts(french)).toEqual({
			separator: 'Redimensionner le panneau 1',
			tabLists: ['Onglets, Files affiché', 'Onglets, Docs affiché', 'Onglets, Search affiché'],
			floatingPanel: 'Search, panneau flottant'
		});
	});

	it('default to englishTranslations, the exported English text', () => {
		expect(englishTranslations.resizePane(2)).toBe('Resize pane 2');
		expect(englishTranslations.floatingPanel('Docs')).toBe('Docs, floating panel');
		expect(englishTranslations.tabList('Files')).toBe('Tabs, Files shown');
	});
});

describe('the views map', () => {
	it('is validated again when a view the layout shows leaves it', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const snippet = createRawSnippet(() => ({ render: () => '<p>Body</p>' }));
		const views = new SvelteMap<Id, View>(
			['a', 'b', 'c'].map((id) => [id, { title: `Title of ${id}`, snippet }])
		);
		const state = $state({ config: twoPanes() });
		render(HorizonLayout, {
			props: {
				get config() {
					return state.config;
				},
				set config(value) {
					state.config = value;
				},
				views,
				translations: {
					resizePane: () => 'Resize',
					floatingPanel: () => 'Floating',
					tabList: () => 'Tabs'
				}
			}
		});
		expect(screen.getAllByRole('tablist')).toHaveLength(2);

		views.delete('c');
		flushSync();

		expect(screen.queryByRole('tablist')).toBeNull();
		expect(error).toHaveBeenCalledWith(
			'HorizonLayout: config.root.views[1].tabs[0]: unknown view id "c"'
		);
	});
});

describe('splitting a pane', () => {
	it('splits only into configs its validation takes, the minimum taken at 4 decimals', async () => {
		const middle = (splitPoints: [number, number]) =>
			({
				root: {
					direction: 'horizontal',
					views: [
						{ tabs: ['a'], activeTabIndex: 0 },
						{ tabs: ['b', 'c'], activeTabIndex: 0 },
						{ tabs: ['d'], activeTabIndex: 0 }
					],
					splitPoints
				}
			}) as LayoutConfig;
		// 0.10005 is taken as 0.1001: the middle pane, 0.2001 wide, can't be halved.
		const props = $state({ config: middle([0.1073, 0.3074]) });
		render(LayoutHarness, {
			props: {
				get config() {
					return props.config;
				},
				set config(value) {
					props.config = value;
				},
				ids: ['a', 'b', 'c', 'd'],
				minWidthRatio: 0.10005
			}
		});
		const views = new Map(['a', 'b', 'c', 'd'].map((id) => [id, null]));

		await pressOnTabList(1, 'ArrowRight', { altKey: true });
		expect(props.config).toEqual(middle([0.1073, 0.3074]));
		expect(screen.getAllByRole('tablist')).toHaveLength(3);

		props.config = middle([0.1073, 0.3075]);
		flushSync();
		await pressOnTabList(1, 'ArrowRight', { altKey: true });
		expect((props.config.root as SplitConfig).splitPoints).toEqual([0.1073, 0.2074, 0.3075]);
		expect(() => validateConfig(props.config, views, { minWidthRatio: 0.10005 })).not.toThrow();
		expect(screen.getAllByRole('tablist')).toHaveLength(4);
	});

	it('rounds the split points it is given, and halves only what they leave room for', async () => {
		const props = $state({
			config: {
				root: {
					direction: 'horizontal',
					views: [
						{ tabs: ['a'], activeTabIndex: 0 },
						{ tabs: ['b', 'c'], activeTabIndex: 0 },
						{ tabs: ['d'], activeTabIndex: 0 }
					],
					splitPoints: [0.10005, 0.30001]
				}
			} as LayoutConfig
		});
		render(LayoutHarness, {
			props: {
				get config() {
					return props.config;
				},
				set config(value) {
					props.config = value;
				},
				ids: ['a', 'b', 'c', 'd']
			}
		});
		flushSync();
		// Taken as [0.1001, 0.3]: the middle pane, 0.1999 wide, can't be halved.
		expect((props.config.root as SplitConfig).splitPoints).toEqual([0.1001, 0.3]);

		await pressOnTabList(1, 'ArrowRight', { altKey: true });
		expect((props.config.root as SplitConfig).splitPoints).toEqual([0.1001, 0.3]);
		const views = new Map(['a', 'b', 'c', 'd'].map((id) => [id, null]));
		expect(() => validateConfig(props.config, views)).not.toThrow();
	});

	it('stores the new split point at the stored precision', async () => {
		const props = $state({
			config: {
				root: {
					direction: 'horizontal',
					views: [
						{ tabs: ['a'], activeTabIndex: 0 },
						{ tabs: ['b', 'c'], activeTabIndex: 0 },
						{ tabs: ['d'], activeTabIndex: 0 }
					],
					splitPoints: [0.1, 0.2]
				}
			} as LayoutConfig
		});
		render(LayoutHarness, {
			props: {
				get config() {
					return props.config;
				},
				set config(value) {
					props.config = value;
				},
				ids: ['a', 'b', 'c', 'd'],
				minWidthRatio: 0.01
			}
		});

		await pressOnTabList(1, 'ArrowRight', { altKey: true });

		// (0.1 + 0.2) / 2 is 0.15000000000000002 in floating point.
		expect((props.config.root as SplitConfig).splitPoints).toEqual([0.1, 0.15, 0.2]);
	});
});

describe('refused splits and docks', () => {
	/** Renders `initial` with the given limits, and returns its state. */
	function renderLimited(initial: LayoutConfig, limits: { maxDepth?: number }) {
		const props = $state({ config: initial });
		const { container } = render(LayoutHarness, {
			props: {
				get config() {
					return props.config;
				},
				set config(value) {
					props.config = value;
				},
				ids: ['a', 'b', 'c', 'd', 'e'],
				...limits
			}
		});
		return { props, container };
	}

	const rect = { x: 0, y: 0, width: 300, height: 200 };

	it('leave a pane too narrow to halve as it is', async () => {
		const narrow: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a', 'b'], activeTabIndex: 0 },
					{ tabs: ['c'], activeTabIndex: 0 }
				],
				splitPoints: [0.15]
			}
		};
		const { props } = renderLimited(structuredClone(narrow), {});

		await pressOnTabList(0, 'ArrowRight', { altKey: true });

		expect(props.config).toEqual(narrow);
	});

	it('stop at maxDepth, from the keyboard and for a dropped tab', async () => {
		const flat: LayoutConfig = { root: { tabs: ['a', 'b'], activeTabIndex: 0 } };
		const { props, container } = renderLimited(structuredClone(flat), { maxDepth: 1 });

		await pressOnTabList(0, 'ArrowDown', { altKey: true });
		expect(props.config).toEqual(flat);

		const transfer = fakeDataTransfer();
		await fireEvent.dragStart(screen.getByRole('tab', { name: 'Title of b' }), {
			dataTransfer: transfer
		});
		await new Promise((resolve) => requestAnimationFrame(resolve));
		flushSync();
		const zone = container.querySelector('.horizon-layout-tabgroup__drop-zone--bottom')!;
		expect(await fireEvent.dragOver(zone, { dataTransfer: transfer })).toBe(true);
		await fireEvent.dragEnd(window);
		expect(props.config).toEqual(flat);
	});

	it('keep a floating tab floating when docking it at an edge has no room', async () => {
		const tooDeep: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 }
				],
				splitPoints: [0.5]
			},
			floating: [{ tabs: ['d'], activeTabIndex: 0, rect }]
		};
		const { props } = renderLimited(structuredClone(tooDeep), { maxDepth: 2 });

		await fireEvent.keyDown(screen.getAllByRole('tablist')[2]!, { key: 'ArrowDown', altKey: true });
		expect(props.config).toEqual(tooDeep);

		const tooNarrow = structuredClone(tooDeep);
		(tooNarrow.root as SplitConfig).splitPoints = [0.15];
		props.config = structuredClone(tooNarrow);
		flushSync();
		await fireEvent.keyDown(screen.getAllByRole('tablist')[2]!, { key: 'ArrowLeft', altKey: true });
		expect(props.config).toEqual(tooNarrow);
	});
});
