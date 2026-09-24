<script lang="ts">
	import HorizonLayout from '$lib/HorizonLayout.svelte';
	import type {
		Id,
		KeyboardControl,
		KeyboardControls,
		KeyboardShortcut,
		LayoutConfig,
		Modifier,
		NodeConfig,
		SplitConfig,
		TabGroupConfig,
		View
	} from '$lib/types.js';
	import '$lib/horizon-layout.css';
	import './demo-themes.css';
	import { SvelteMap } from 'svelte/reactivity';
	import { createRawSnippet, mount, unmount } from 'svelte';
	import {
		buildNodeParentMap,
		cloneConfig,
		nodeConfigType,
		parseLayoutConfig,
		simplifyTabGroup
	} from '$lib/utils.js';
	import { themes, themeClassMap } from './themes.js';
	import DemoPage from './DemoPage.svelte';
	import NestedDemo from './NestedDemo.svelte';
	import KeyboardControlsEditor from './KeyboardControls.svelte';
	import type { ActionId } from './KeyboardControls.svelte';
	import LayoutOptions from './LayoutOptions.svelte';
	import { ratioFormats, type RatioFormat } from './LayoutOptions.svelte';

	// ------------------------------------------------------------------ pages

	/** Palette used to assign an accent color per demo page. */
	const palette = [
		'oklch(0.65 0.18 277)',
		'oklch(0.68 0.13 200)',
		'oklch(0.7 0.14 155)',
		'oklch(0.72 0.15 85)',
		'oklch(0.66 0.16 25)',
		'oklch(0.64 0.17 315)',
		'oklch(0.7 0.12 230)',
		'oklch(0.68 0.13 120)'
	];

	type PageKind = 'standard' | 'explorer' | 'terminal' | 'settings' | 'nested';

	interface DemoPageDef {
		id: Id;
		title: string;
		kind: PageKind;
		persistent?: boolean;
	}

	function defaultPages(): DemoPageDef[] {
		return [
			{ id: 'getting-started', title: 'Getting started', kind: 'standard', persistent: true },
			{ id: 'explorer', title: 'Explorer', kind: 'explorer' },
			{ id: 'preview', title: 'Preview', kind: 'standard' },
			{ id: 'terminal', title: 'Terminal', kind: 'terminal' },
			{ id: 'settings', title: 'Settings', kind: 'settings' },
			{ id: 'nested', title: 'Nested layout', kind: 'nested', persistent: true }
		];
	}

	let pages = $state<DemoPageDef[]>(defaultPages());
	let nextPageNumber = 1;

	// ----------------------------------------------------------------- layout

	function defaultConfig(): LayoutConfig {
		return {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['getting-started', 'settings'], activeTabIndex: 0 },
					{
						direction: 'vertical',
						views: [
							{ tabs: ['explorer'], activeTabIndex: 0 },
							{ tabs: ['terminal'], activeTabIndex: 0 }
						],
						splitPoints: [0.6]
					},
					{
						direction: 'vertical',
						views: [
							{ tabs: ['preview'], activeTabIndex: 0 },
							{ tabs: ['nested'], activeTabIndex: 0 }
						],
						splitPoints: [0.6]
					}
				],
				splitPoints: [0.26, 0.55]
			}
		};
	}

	let config: LayoutConfig = $state(defaultConfig());

	let mainTheme = $state(themes[0]!.id);

	// ------------------------------------------------------------- prop knobs

	let showSplitRatio = $state(true);
	let disableResizeSplits = $state(false);
	let disableDragAndDrop = $state(false);
	let hideTabBar = $state(false);
	let skipValidation = $state(false);
	let minWidthRatio = $state(0.1);
	let minHeightRatio = $state(0.2);
	let maxDepth = $state(6);
	let ratioFormat = $state<RatioFormat>('percent');

	/** Whether the layout, pages, theme and options persist in localStorage. */
	let persistLayout = $state(false);

	let formatRatio = $derived(ratioFormats[ratioFormat].format);
	let formatRatioForAria = $derived(ratioFormats[ratioFormat].aria);

	// ---------------------------------------------------------- view snippets

	function pageSnippet(page: DemoPageDef, accent: string) {
		return createRawSnippet(() => ({
			render: () =>
				`<div style="width:100%;height:100%;display:flex;flex-direction:column;"></div>`,
			setup: (element) => {
				const handle =
					page.kind === 'nested'
						? mount(NestedDemo, { target: element })
						: mount(DemoPage, {
								target: element,
								props: {
									accent,
									title: page.title,
									id: page.id,
									kind: page.kind,
									persistent: !!page.persistent,
									restore: () => (config.maximizedView = undefined)
								}
							});
				return () => {
					void unmount(handle as Parameters<typeof unmount>[0]);
				};
			}
		}));
	}

	let views = $derived.by(() => {
		const map = new SvelteMap<Id, View>();
		pages.forEach((page, index) => {
			map.set(page.id, {
				title: page.title,
				snippet: pageSnippet(page, palette[index % palette.length]!),
				tabControls: [popoutButton, closeButton]
			});
		});
		return map;
	});

	// --------------------------------------------------------- layout helpers

	function lastTabGroup(node: NodeConfig): TabGroupConfig {
		if (nodeConfigType(node) === 'tabGroup') return node as TabGroupConfig;
		const vs = (node as SplitConfig).views;
		return lastTabGroup(vs[vs.length - 1]!);
	}

	// ---------------------------------------------------------- sidebar pages

	function addPage() {
		const id = `page-${nextPageNumber++}` as Id;
		pages = [...pages, { id, title: `Page ${nextPageNumber - 1}`, kind: 'standard' }];
		if (config.root) {
			const group = lastTabGroup(config.root);
			group.tabs.push(id);
			group.activeTabIndex = group.tabs.length - 1;
		} else {
			config.root = { tabs: [id], activeTabIndex: 0 };
		}
	}

	function removePage(id: Id) {
		const def = pages.find((p) => p.id === id);
		if (!def || def.persistent) return;

		if (config.root) {
			const map = buildNodeParentMap(config.root);
			const find = (node: NodeConfig): TabGroupConfig | null => {
				if (nodeConfigType(node) === 'tabGroup') {
					return (node as TabGroupConfig).tabs.includes(id) ? (node as TabGroupConfig) : null;
				}
				for (const view of (node as SplitConfig).views) {
					const found = find(view);
					if (found) return found;
				}
				return null;
			};
			const group = find(config.root);
			if (group) {
				const index = group.tabs.indexOf(id);
				group.tabs.splice(index, 1);
				group.activeTabIndex = Math.min(group.activeTabIndex, group.tabs.length - 1);
				simplifyTabGroup(group, map, config);
			}
		}

		if (config.maximizedView === id) config.maximizedView = undefined;
		if (config.popouts?.includes(id)) {
			const remaining = config.popouts.filter((p) => p !== id);
			config.popouts = remaining.length ? remaining : undefined;
		}
		pages = pages.filter((p) => p.id !== id);
	}

	// ----------------------------------------------------------------- popout

	let popoutsOriginalPositions: { viewId: Id; position: number[] }[] = [];

	function popout(viewId: Id) {
		if (!config.root || config.popouts?.includes(viewId)) return;
		popoutsOriginalPositions = popoutsOriginalPositions.filter((p) => p.viewId !== viewId);

		const configCopy = cloneConfig(config);
		const position: number[] = [];
		const walk = (node: NodeConfig): { tabGroup: TabGroupConfig; index: number } | null => {
			if (nodeConfigType(node) === 'split') {
				const split = node as SplitConfig;
				for (let i = 0; i < split.views.length; i++) {
					const result = walk(split.views[i]!);
					if (result) {
						position.push(i);
						return result;
					}
				}
				return null;
			}
			const tabGroup = node as TabGroupConfig;
			for (let i = 0; i < tabGroup.tabs.length; i++) {
				if (tabGroup.tabs[i] === viewId) {
					position.push(i);
					return { tabGroup, index: i };
				}
			}
			return null;
		};

		const found = configCopy.root ? walk(configCopy.root) : null;
		if (!found) return;

		found.tabGroup.tabs.splice(found.index, 1);
		found.tabGroup.activeTabIndex = Math.min(
			found.tabGroup.activeTabIndex,
			found.tabGroup.tabs.length - 1
		);
		simplifyTabGroup(found.tabGroup, buildNodeParentMap(configCopy.root!), configCopy);
		configCopy.popouts = [...(configCopy.popouts ?? []), viewId];
		popoutsOriginalPositions.push({ viewId, position });
		config = configCopy;
	}

	function onPopoutClose(viewId: Id) {
		if (!config.popouts?.includes(viewId)) return;
		const position = popoutsOriginalPositions.reduceRight<number[]>(
			(acc, p, i, arr) => (p.viewId === viewId ? (arr.splice(i, 1), p.position) : acc),
			[]
		);
		const configCopy = cloneConfig(config);

		if (configCopy.root) {
			const place = (node: NodeConfig) => {
				const index = position.pop() ?? 0;
				if (nodeConfigType(node) === 'split') {
					const split = node as SplitConfig;
					if (index >= split.views.length) {
						split.views.push({ tabs: [viewId], activeTabIndex: 0 });
					} else {
						place(split.views[index]!);
					}
				} else {
					const tabGroup = node as TabGroupConfig;
					tabGroup.tabs.splice(index, 0, viewId);
				}
			};
			place(configCopy.root);
		} else {
			configCopy.root = { tabs: [viewId], activeTabIndex: 0 };
		}

		configCopy.popouts = configCopy.popouts?.filter((id) => id !== viewId);
		if (configCopy.popouts?.length === 0) configCopy.popouts = undefined;

		config = configCopy;
	}

	// ------------------------------------------------------ keyboard controls

	const defaultBindings: Record<ActionId, KeyboardShortcut> = {
		deselect: { key: 'Escape' },
		cycleNext: { key: 'ArrowRight' },
		cyclePrev: { key: 'ArrowLeft' },
		moveTabNext: { modifier: 'shift', key: 'ArrowRight' },
		moveTabPrev: { modifier: 'shift', key: 'ArrowLeft' },
		splitRight: { modifier: 'alt', key: 'ArrowRight' },
		splitLeft: { modifier: 'alt', key: 'ArrowLeft' },
		splitUp: { modifier: 'alt', key: 'ArrowUp' },
		splitDown: { modifier: 'alt', key: 'ArrowDown' },
		moveNextPane: { modifier: 'ctrl', key: 'ArrowRight' },
		movePrevPane: { modifier: 'ctrl', key: 'ArrowLeft' },
		resizeBigger: { key: 'ArrowRight' },
		resizeSmaller: { key: 'ArrowLeft' },
		resizeMin: { key: 'Home' },
		resizeMax: { key: 'End' }
	};

	let kbBindings = $state<Record<ActionId, KeyboardShortcut>>(structuredClone(defaultBindings));

	function onBindingChanged(action: ActionId, binding: { modifier: string; key: string }) {
		const key = binding.key.trim();
		kbBindings[action] = {
			modifier: (binding.modifier || undefined) as Modifier | undefined,
			key: key || defaultBindings[action]!.key
		};
	}

	function resetBindings() {
		kbBindings = structuredClone(defaultBindings);
	}

	function perpendicular(key: string): string | null {
		if (key === 'ArrowRight') return 'ArrowDown';
		if (key === 'ArrowDown') return 'ArrowRight';
		if (key === 'ArrowLeft') return 'ArrowUp';
		if (key === 'ArrowUp') return 'ArrowLeft';
		return null;
	}

	// Actions that only touch the config object they receive.
	function moveTabInGroup(tg: TabGroupConfig, dir: 1 | -1) {
		const count = tg.tabs.length;
		if (count < 2) return;
		const target = (tg.activeTabIndex + dir + count) % count;
		const [tab] = tg.tabs.splice(tg.activeTabIndex, 1);
		if (!tab) return;
		tg.tabs.splice(target, 0, tab);
		tg.activeTabIndex = target;
	}

	// Actions that need the full tree: locate the matching external tab group via
	// the active view id (view ids are unique across the layout).
	function findExternalTabGroup(tg: TabGroupConfig): TabGroupConfig | null {
		const activeId = tg.tabs[tg.activeTabIndex];
		if (!activeId || !config.root) return null;
		const walk = (node: NodeConfig): TabGroupConfig | null => {
			if (nodeConfigType(node) === 'tabGroup') {
				return (node as TabGroupConfig).tabs.includes(activeId) ? (node as TabGroupConfig) : null;
			}
			for (const view of (node as SplitConfig).views) {
				const found = walk(view);
				if (found) return found;
			}
			return null;
		};
		return walk(config.root);
	}

	function paneMidpoint(entry: { parent: SplitConfig; index: number }): number {
		return (
			((entry.parent.splitPoints[entry.index - 1] ?? 0) +
				(entry.parent.splitPoints[entry.index] ?? 1)) /
			2
		);
	}

	function canSplit(group: TabGroupConfig, splitDirection: 'horizontal' | 'vertical'): boolean {
		if (!config.root) return false;
		const map = buildNodeParentMap(config.root);
		const minRatio = splitDirection === 'horizontal' ? minWidthRatio : minHeightRatio;
		const entry = map.get(group);
		if (entry?.parent.direction === splitDirection) {
			return (
				((entry.parent.splitPoints[entry.index] ?? 1) -
					(entry.parent.splitPoints[entry.index - 1] ?? 0)) /
					2 >=
				minRatio
			);
		}
		const depth = (node: NodeConfig, d = 1): number => {
			const parent = map.get(node);
			return parent ? depth(parent.parent, d + 1) : d;
		};
		return depth(group) + 1 <= maxDepth;
	}

	function demoSplit(tg: TabGroupConfig, direction: 'left' | 'right' | 'up' | 'down') {
		const group = findExternalTabGroup(tg);
		if (!group || group.tabs.length < 2 || !config.root) return;
		const splitDirection =
			direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
		if (!canSplit(group, splitDirection)) return;

		const map = buildNodeParentMap(config.root);
		const entry = map.get(group);
		const activeId = group.tabs[group.activeTabIndex]!;
		const oldActive = group.activeTabIndex;
		const isFirst = direction === 'left' || direction === 'up';
		const newGroup: TabGroupConfig = { tabs: [activeId], activeTabIndex: 0 };

		group.tabs = group.tabs.filter((_, i) => i !== oldActive) as [Id, ...Id[]];
		group.activeTabIndex = Math.min(oldActive, group.tabs.length - 1);

		if (!entry || entry.parent.direction !== splitDirection) {
			const split: SplitConfig = {
				direction: splitDirection,
				views: isFirst ? [newGroup, group] : [group, newGroup],
				splitPoints: [0.5]
			};
			if (entry) entry.parent.views[entry.index] = split;
			else config.root = split;
		} else {
			entry.parent.views.splice(entry.index + (isFirst ? 0 : 1), 0, newGroup);
			entry.parent.splitPoints.splice(entry.index, 0, paneMidpoint(entry));
		}
	}

	function demoMoveTabToClosest(tg: TabGroupConfig, direction: 'left' | 'right' | 'up' | 'down') {
		const source = findExternalTabGroup(tg);
		if (!source || !config.root) return;
		const map = buildNodeParentMap(config.root);
		const axis = direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
		const isLeftUp = direction === 'left' || direction === 'up';
		const sourceTab = source.tabs[source.activeTabIndex]!;

		const edge = (node: NodeConfig): TabGroupConfig => {
			if (nodeConfigType(node) === 'tabGroup') return node as TabGroupConfig;
			const split = node as SplitConfig;
			return edge(split.views[isLeftUp ? split.views.length - 1 : 0]!);
		};

		const walk = (child: NodeConfig): void => {
			const entry = map.get(child);
			if (!entry) return;
			if (entry.parent.direction !== axis) return walk(entry.parent);
			const targetIndex = entry.index + (isLeftUp ? -1 : 1);
			if (targetIndex < 0 || targetIndex >= entry.parent.views.length) return walk(entry.parent);

			source.tabs.splice(source.activeTabIndex, 1);
			source.activeTabIndex = Math.min(source.activeTabIndex, source.tabs.length - 1);
			simplifyTabGroup(source, map, config);
			const destination = edge(entry.parent.views[targetIndex]!);
			destination.activeTabIndex = destination.tabs.length;
			destination.tabs.push(sourceTab);
		};

		walk(source);
	}

	function demoMoveSplit(split: SplitConfig, index: number, ratio: number) {
		const minRatio = split.direction === 'horizontal' ? minWidthRatio : minHeightRatio;
		const min = (split.splitPoints[index - 1] ?? 0) + minRatio;
		const max = (split.splitPoints[index + 1] ?? 1) - minRatio;
		const clamped = Number(Math.min(Math.max(ratio, min), max).toFixed(4));
		if (clamped !== split.splitPoints[index]) split.splitPoints[index] = clamped;
	}

	const tabGroupHandlers: Record<string, (tg: TabGroupConfig, event: KeyboardEvent) => void> = {
		deselect: (_, event) => (event.currentTarget as HTMLElement).blur(),
		cycleNext: (tg) => (tg.activeTabIndex = (tg.activeTabIndex + 1) % tg.tabs.length),
		cyclePrev: (tg) =>
			(tg.activeTabIndex = (tg.activeTabIndex + tg.tabs.length - 1) % tg.tabs.length),
		moveTabNext: (tg) => moveTabInGroup(tg, 1),
		moveTabPrev: (tg) => moveTabInGroup(tg, -1),
		splitRight: (tg) => demoSplit(tg, 'right'),
		splitLeft: (tg) => demoSplit(tg, 'left'),
		splitUp: (tg) => demoSplit(tg, 'up'),
		splitDown: (tg) => demoSplit(tg, 'down'),
		moveNextPane: (tg) => demoMoveTabToClosest(tg, 'right'),
		movePrevPane: (tg) => demoMoveTabToClosest(tg, 'left')
	};

	const splitHandlers: Record<
		string,
		(data: { config: SplitConfig; index: number }, event: KeyboardEvent) => void
	> = {
		deselect: (_, event) => (event.currentTarget as HTMLElement).blur(),
		resizeBigger: (data) =>
			demoMoveSplit(data.config, data.index, data.config.splitPoints[data.index]! + 0.01),
		resizeSmaller: (data) =>
			demoMoveSplit(data.config, data.index, data.config.splitPoints[data.index]! - 0.01),
		resizeMin: (data) => demoMoveSplit(data.config, data.index, 0),
		resizeMax: (data) => demoMoveSplit(data.config, data.index, 1)
	};

	function buildControls(bindings: Record<ActionId, KeyboardShortcut>): KeyboardControls {
		const tabGroup: KeyboardControl<TabGroupConfig>[] = [];
		const pushTab = (action: ActionId, extraKeys: string[] = []) => {
			const binding = bindings[action];
			if (!binding || !tabGroupHandlers[action]) return;
			const modifier = binding.modifier as Modifier | undefined;
			tabGroup.push({
				shortcuts: [binding, ...extraKeys.map((key) => ({ modifier, key }))],
				action: tabGroupHandlers[action]!
			});
		};
		pushTab('deselect');
		pushTab('cycleNext', ['ArrowDown']);
		pushTab('cyclePrev', ['ArrowUp']);
		pushTab('moveTabNext', ['ArrowDown']);
		pushTab('moveTabPrev', ['ArrowUp']);
		pushTab('splitRight');
		pushTab('splitLeft');
		pushTab('splitUp');
		pushTab('splitDown');
		pushTab('moveNextPane');
		pushTab('movePrevPane');

		const splits: KeyboardControl<{ config: SplitConfig; index: number }>[] = [];
		const pushSplit = (action: ActionId, extraKeys: string[] = []) => {
			const binding = bindings[action];
			if (!binding || !splitHandlers[action]) return;
			const modifier = binding.modifier as Modifier | undefined;
			splits.push({
				shortcuts: [binding, ...extraKeys.map((key) => ({ modifier, key }))],
				action: splitHandlers[action]!
			});
		};
		pushSplit('deselect');
		pushSplit(
			'resizeSmaller',
			perpendicular(bindings.resizeSmaller!.key)
				? [perpendicular(bindings.resizeSmaller!.key)!]
				: []
		);
		pushSplit(
			'resizeBigger',
			perpendicular(bindings.resizeBigger!.key) ? [perpendicular(bindings.resizeBigger!.key)!] : []
		);
		pushSplit('resizeMin');
		pushSplit('resizeMax');

		return { splitControls: splits, tabGroupControls: tabGroup };
	}

	let keyboardControls = $derived(buildControls(kbBindings));

	// ------------------------------------------------------------ persistence

	const STORAGE_KEY = 'horizon-layout-demo-state';

	let statusMessage = $state('');
	let saveHandle: ReturnType<typeof setTimeout> | null = null;

	function currentState() {
		return {
			persist: persistLayout,
			config: cloneConfig(config),
			pages: $state.snapshot(pages),
			theme: mainTheme,
			showSplitRatio,
			disableResizeSplits,
			disableDragAndDrop,
			hideTabBar,
			skipValidation,
			minWidthRatio,
			minHeightRatio,
			maxDepth,
			ratioFormat
		};
	}

	function applyPersisted(state: {
		config?: unknown;
		pages?: unknown;
		theme?: unknown;
		showSplitRatio?: unknown;
		disableResizeSplits?: unknown;
		disableDragAndDrop?: unknown;
		hideTabBar?: unknown;
		skipValidation?: unknown;
		minWidthRatio?: unknown;
		minHeightRatio?: unknown;
		maxDepth?: unknown;
		ratioFormat?: unknown;
	}): boolean {
		try {
			const parsed = parseLayoutConfig(state.config);
			const restoredPages = (Array.isArray(state.pages) ? state.pages : [])
				.filter(
					(p: { id?: unknown; title?: unknown; kind?: unknown }) =>
						typeof p?.id === 'string' && p.id !== '' && typeof p?.title === 'string'
				)
				.map((p: { id: string; title: string; kind?: string; persistent?: boolean }) => ({
					id: p.id as Id,
					title: p.title,
					kind: (['standard', 'explorer', 'terminal', 'settings', 'nested'].includes(
						p.kind as string
					)
						? p.kind
						: 'standard') as PageKind,
					persistent: !!p.persistent
				}));
			if (!restoredPages.some((p: DemoPageDef) => p.kind === 'nested')) return false;
			config = parsed;
			pages = restoredPages;
			mainTheme = themes.some((t) => t.id === state.theme)
				? (state.theme as string)
				: themes[0]!.id;
			showSplitRatio = state.showSplitRatio === undefined ? true : !!state.showSplitRatio;
			disableResizeSplits = !!state.disableResizeSplits;
			disableDragAndDrop = !!state.disableDragAndDrop;
			hideTabBar = !!state.hideTabBar;
			skipValidation = !!state.skipValidation;
			minWidthRatio = typeof state.minWidthRatio === 'number' ? state.minWidthRatio : 0.1;
			minHeightRatio = typeof state.minHeightRatio === 'number' ? state.minHeightRatio : 0.2;
			maxDepth = typeof state.maxDepth === 'number' ? state.maxDepth : 6;
			ratioFormat =
				typeof state.ratioFormat === 'string' && state.ratioFormat in ratioFormats
					? (state.ratioFormat as typeof ratioFormat)
					: 'percent';
			return true;
		} catch {
			return false;
		}
	}

	function setPersist(enabled: boolean) {
		persistLayout = enabled;
		if (!enabled) {
			if (saveHandle !== null) {
				clearTimeout(saveHandle);
				saveHandle = null;
			}
			localStorage.removeItem(STORAGE_KEY);
			statusMessage = 'Persistence off — saved layout removed';
		} else {
			statusMessage = 'Persistence on — layout saves automatically';
		}
	}

	// Auto-save while persistence is enabled (debounced).
	$effect(() => {
		if (!persistLayout) return;
		const json = JSON.stringify(currentState());
		if (saveHandle !== null) clearTimeout(saveHandle);
		saveHandle = setTimeout(() => {
			saveHandle = null;
			if (persistLayout) localStorage.setItem(STORAGE_KEY, json);
		}, 250);
	});

	// Restore the persisted state once at startup, if the switch was left on.
	{
		let persisted: Record<string, unknown> | null = null;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed?.persist === true) persisted = parsed;
			}
		} catch {
			// ignore malformed storage
		}
		persistLayout = persisted !== null;
		if (persisted) applyPersisted(persisted);
	}
</script>

{#snippet popoutButton(viewId: Id)}
	<button class="ctl" onclick={() => popout(viewId)} title="Pop out">⤢</button>
{/snippet}

{#snippet closeButton(viewId: Id)}
	{@const page = pages.find((p) => p.id === viewId)}
	<button
		class="ctl"
		onclick={() => removePage(viewId)}
		title={page?.persistent ? 'This page is locked' : 'Remove page'}
		disabled={page?.persistent}
	>
		✕
	</button>
{/snippet}

{#snippet maximizeToggle(activeViewId: Id)}
	<button
		class="ctl"
		onclick={() =>
			(config.maximizedView = config.maximizedView === activeViewId ? undefined : activeViewId)}
		title="Maximize / restore"
	>
		⛶
	</button>
{/snippet}

<div class="app {themeClassMap[mainTheme]}">
	<aside class="sidebar">
		<header class="sidebar__brand">
			<div>
				<h1>horizon-layout</h1>
				<p>demo playground</p>
			</div>
		</header>

		<section class="sidebar__section">
			<h2>Pages</h2>
			<ul class="page-list">
				{#each pages as page (page.id)}
					<li>
						<span class="page-list__title">{page.title}</span>
						{#if page.persistent}
							<span class="page-list__lock" title="Locked">locked</span>
						{:else}
							<button
								class="ctl page-list__remove"
								onclick={() => removePage(page.id)}
								title="Remove"
							>
								✕
							</button>
						{/if}
					</li>
				{/each}
			</ul>
			<button class="btn btn--full" onclick={addPage}>+ Add page</button>
		</section>

		<section class="sidebar__section">
			<h2>Theme</h2>
			<select
				class="select"
				value={mainTheme}
				onchange={(e) => (mainTheme = (e.currentTarget as HTMLSelectElement).value)}
			>
				{#each themes as theme (theme.id)}
					<option value={theme.id}>{theme.name}</option>
				{/each}
			</select>
		</section>

		<section class="sidebar__section">
			<h2>Local storage</h2>
			<label class="check">
				<input
					type="checkbox"
					checked={persistLayout}
					onchange={(e) => setPersist((e.currentTarget as HTMLInputElement).checked)}
				/>
				Save layout automatically
			</label>
			{#if statusMessage}<p class="sidebar__status">{statusMessage}</p>{/if}
		</section>

		<LayoutOptions
			{config}
			bind:showSplitRatio
			bind:disableResizeSplits
			bind:disableDragAndDrop
			bind:hideTabBar
			bind:skipValidation
			bind:minWidthRatio
			bind:minHeightRatio
			bind:maxDepth
			bind:ratioFormat
		/>

		<section class="sidebar__section">
			<h2>Keyboard controls</h2>
			<KeyboardControlsEditor bindings={kbBindings} onChanged={onBindingChanged} />
			<button class="btn btn--full" onclick={resetBindings}>Reset bindings</button>
		</section>
	</aside>

	<main class="layout">
		<HorizonLayout
			bind:config
			{views}
			{showSplitRatio}
			{disableResizeSplits}
			{disableDragAndDrop}
			{hideTabBar}
			{skipValidation}
			{minWidthRatio}
			{minHeightRatio}
			{maxDepth}
			{formatRatio}
			{formatRatioForAria}
			{keyboardControls}
			tabgroupControls={[maximizeToggle]}
			{onPopoutClose}
		/>
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: system-ui, sans-serif;
	}

	.app {
		display: flex;
		width: 100vw;
		height: 100vh;
		background: var(--hl-background);
		color: var(--hl-foreground);
	}

	/* ------------------------------------------------------------ sidebar */

	.sidebar {
		width: 290px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		box-sizing: border-box;
		border-right: 1px solid var(--hl-border);
		background: var(--hl-card);
		overflow-y: auto;
	}

	.sidebar__brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.sidebar__brand h1 {
		margin: 0;
		font-size: 0.95rem;
	}

	.sidebar__brand p {
		margin: 0;
		font-size: 0.68rem;
		color: var(--hl-muted-foreground);
	}

	.sidebar h2 {
		margin: 0 0 0.5rem;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--hl-muted-foreground);
	}

	.sidebar__section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-bottom: 0.9rem;
		border-bottom: 1px solid var(--hl-border);
	}

	.page-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.page-list li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0.5rem;
		border-radius: 0.4rem;
		background: var(--hl-secondary);
		font-size: 0.75rem;
	}

	.page-list__title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.page-list__lock {
		font-size: 0.6rem;
		color: var(--hl-muted-foreground);
	}

	.page-list__remove {
		background: transparent;
	}

	.btn {
		border: 1px solid var(--hl-border);
		background: var(--hl-secondary);
		color: var(--hl-foreground);
		font-size: 0.72rem;
		padding: 0.3rem 0.55rem;
		border-radius: 0.4rem;
		cursor: pointer;
	}

	.btn:hover {
		background: var(--hl-accent);
	}

	.btn--full {
		width: 100%;
	}

	.select {
		font-size: 0.75rem;
		padding: 0.25rem 0.45rem;
		border-radius: 0.4rem;
		border: 1px solid var(--hl-border);
		background: var(--hl-card);
		color: var(--hl-foreground);
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.75rem;
	}

	.sidebar__status {
		margin: 0;
		font-size: 0.7rem;
		color: var(--hl-primary);
	}

	.ctl {
		border: none;
		color: var(--hl-primary);
		cursor: pointer;
		padding: 2px 5px;
		border-radius: 4px;
		font-size: 0.7rem;
		line-height: 1.2;
		background: var(--hl-secondary);
	}

	.ctl:disabled {
		opacity: 0.4;
		cursor: default;
	}

	/* ------------------------------------------------------------- layout */

	.layout {
		flex: 1;
		min-width: 0;
		min-height: 0;
	}
</style>
