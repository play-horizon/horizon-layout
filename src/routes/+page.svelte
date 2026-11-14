<script lang="ts">
	import HorizonLayout from '#lib/HorizonLayout.svelte';
	import type {
		FloatingRect,
		Id,
		KeyboardShortcut,
		LayoutConfig,
		Modifier,
		NodeConfig,
		SplitConfig,
		TabGroupConfig,
		View
	} from '#lib/types.js';
	import '#lib/horizon-layout.css';
	import './demo-themes.css';
	import { SvelteMap } from 'svelte/reactivity';
	import { createRawSnippet, mount, unmount } from 'svelte';
	import {
		buildNodeParentMap,
		cloneConfig,
		floatView,
		nodeConfigType,
		removeView,
		simplifyTabGroup
	} from '#lib/utils.js';
	import { themes, themeClassMap } from './themes.js';
	import DemoPage from './DemoPage.svelte';
	import NestedDemo from './NestedDemo.svelte';
	import KeyboardControlsEditor from './KeyboardControls.svelte';
	import type { ActionId } from './KeyboardControls.svelte';
	import LayoutOptions from './LayoutOptions.svelte';
	import { ratioFormats, type RatioFormat } from './ratio-formats.js';
	import { translations } from './translations.js';
	import IconButton from './IconButton.svelte';
	import CloseIcon from '~icons/mingcute/close-line';
	import FloatIcon from '~icons/mingcute/miniplayer-line';
	import MaximizeIcon from '~icons/mingcute/fullscreen-line';
	import PopoutIcon from '~icons/mingcute/external-link-line';
	import { defaultConfig, defaultPages, highestPageNumber, type DemoPageDef } from './pages.js';
	import { lastTabGroup } from './layout-tree.js';
	import {
		buildKeyboardControls,
		defaultBindings,
		isDefaultBindings,
		type DemoLayout
	} from './keyboard-actions.js';
	import { clearDemoState, loadDemoState, saveDemoState, type DemoState } from './persistence.js';

	let pages = $state<DemoPageDef[]>(defaultPages());
	let nextPageNumber = 1;

	let config: LayoutConfig = $state(defaultConfig());

	let mainTheme = $state(themes[0]!.id);

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

	function pageSnippet(page: DemoPageDef) {
		return createRawSnippet(() => ({
			render: () =>
				`<div style="width:100%;height:100%;display:flex;flex-direction:column;"></div>`,
			setup: (element) => {
				const handle =
					page.kind === 'nested'
						? mount(NestedDemo, { target: element })
						: mount(DemoPage, {
								target: element,
								props: { kind: page.kind, config: () => config }
							});
				return () => {
					void unmount(handle as Parameters<typeof unmount>[0]);
				};
			}
		}));
	}

	let views = $derived.by(() => {
		const map = new SvelteMap<Id, View>();
		for (const page of pages) {
			map.set(page.id, {
				title: page.title,
				snippet: pageSnippet(page),
				tabControls: [floatButton, popoutButton, closeButton]
			});
		}
		return map;
	});

	function addPage() {
		const id = `page-${nextPageNumber++}` as Id;
		pages = [...pages, { id, title: `Page ${nextPageNumber - 1}`, kind: 'blank' }];
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
		removeView(config, id);
		pages = pages.filter((p) => p.id !== id);
	}

	// Floats a view in front of the others, each new one a little lower and to the right.
	function float(viewId: Id) {
		const offset = 24 * (config.floating?.length ?? 0);
		floatView(config, viewId, { x: 80 + offset, y: 60 + offset, width: 380, height: 260 });
	}

	function resetLayout() {
		pages = defaultPages();
		config = defaultConfig();
		nextPageNumber = 1;
		popoutsOriginalPositions = [];
	}

	// Where each popped-out view came from: its path in the docked tree, or its floating rect.
	let popoutsOriginalPositions: { viewId: Id; position: number[]; rect?: FloatingRect }[] = [];

	function popout(viewId: Id) {
		if (config.popouts?.includes(viewId)) return;
		popoutsOriginalPositions = popoutsOriginalPositions.filter((p) => p.viewId !== viewId);

		const floatingGroup = config.floating?.find((group) => group.tabs.includes(viewId));
		if (floatingGroup) {
			const rect = { ...floatingGroup.rect };
			removeView(config, viewId);
			config.popouts = [...(config.popouts ?? []), viewId];
			popoutsOriginalPositions.push({ viewId, position: [], rect });
			return;
		}
		if (!config.root) return;

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
		const original = popoutsOriginalPositions.findLast((p) => p.viewId === viewId);
		if (original?.rect) {
			popoutsOriginalPositions = popoutsOriginalPositions.filter((p) => p !== original);
			floatView(config, viewId, original.rect);
			return;
		}
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

	let kbBindings = $state<Record<ActionId, KeyboardShortcut>>(structuredClone(defaultBindings));

	function onBindingChanged(action: ActionId, binding: { modifier: string; key: string }) {
		const key = binding.key.trim();
		kbBindings[action] = {
			modifier: (binding.modifier || undefined) as Modifier | undefined,
			key: key || defaultBindings[action].key
		};
	}

	function resetBindings() {
		kbBindings = structuredClone(defaultBindings);
	}

	// What the demo's keyboard actions read when they run: the live config and options.
	const layout: DemoLayout = {
		get config() {
			return config;
		},
		get minWidthRatio() {
			return minWidthRatio;
		},
		get minHeightRatio() {
			return minHeightRatio;
		},
		get maxDepth() {
			return maxDepth;
		}
	};

	// The library's built-in controls until a binding is changed; this demo's own after that.
	let keyboardControls = $derived(
		isDefaultBindings(kbBindings) ? {} : buildKeyboardControls(kbBindings, layout)
	);

	let saveHandle: ReturnType<typeof setTimeout> | null = null;

	function currentState(): DemoState {
		return {
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

	function applyState(state: DemoState) {
		config = state.config;
		pages = state.pages;
		nextPageNumber = highestPageNumber(state.pages) + 1;
		mainTheme = state.theme;
		showSplitRatio = state.showSplitRatio;
		disableResizeSplits = state.disableResizeSplits;
		disableDragAndDrop = state.disableDragAndDrop;
		hideTabBar = state.hideTabBar;
		skipValidation = state.skipValidation;
		minWidthRatio = state.minWidthRatio;
		minHeightRatio = state.minHeightRatio;
		maxDepth = state.maxDepth;
		ratioFormat = state.ratioFormat;
	}

	function setPersist(enabled: boolean) {
		persistLayout = enabled;
		if (!enabled) {
			if (saveHandle !== null) {
				clearTimeout(saveHandle);
				saveHandle = null;
			}
			clearDemoState();
		}
	}

	// Auto-save while persistence is enabled (debounced).
	$effect(() => {
		if (!persistLayout) return;
		const state = currentState();
		if (saveHandle !== null) clearTimeout(saveHandle);
		saveHandle = setTimeout(() => {
			saveHandle = null;
			if (persistLayout) saveDemoState(state);
		}, 250);
	});

	// Restore the persisted state once at startup, if the switch was left on.
	{
		const persisted = loadDemoState();
		persistLayout = persisted !== null;
		if (persisted) applyState(persisted);
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && !event.defaultPrevented && config.maximizedView) {
			config.maximizedView = undefined;
		}
	}}
/>

{#snippet floatButton(viewId: Id)}
	{#if !config.floating?.some((group) => group.tabs.length === 1 && group.tabs[0] === viewId)}
		<IconButton icon={FloatIcon} label="Float" onclick={() => float(viewId)} />
	{/if}
{/snippet}

{#snippet popoutButton(viewId: Id)}
	<IconButton icon={PopoutIcon} label="Pop out" onclick={() => popout(viewId)} />
{/snippet}

{#snippet closeButton(viewId: Id)}
	{#if !pages.find((p) => p.id === viewId)?.persistent}
		<IconButton icon={CloseIcon} label="Close" onclick={() => removePage(viewId)} />
	{/if}
{/snippet}

{#snippet maximizeButton(activeViewId: Id)}
	<IconButton
		icon={MaximizeIcon}
		label="Maximize"
		onclick={() => (config.maximizedView = activeViewId)}
	/>
{/snippet}

<div class="app {themeClassMap[mainTheme]}">
	<aside class="sidebar">
		<div class="sidebar__column">
			<header class="sidebar__brand">
				<h1>horizon-layout</h1>
				<a href="https://github.com/play-horizon/horizon-layout">GitHub</a>
			</header>

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
				<h2>Persistence</h2>
				<label class="check">
					<input
						type="checkbox"
						checked={persistLayout}
						onchange={(e) => setPersist((e.currentTarget as HTMLInputElement).checked)}
					/>
					Save to localStorage
				</label>
			</section>
		</div>

		<div class="sidebar__column">
			<section class="sidebar__section">
				<h2>Pages</h2>
				<ul class="page-list">
					{#each pages as page (page.id)}
						<li>
							<span class="page-list__title">{page.title}</span>
							{#if !page.persistent}
								<IconButton
									icon={CloseIcon}
									label="Remove {page.title}"
									onclick={() => removePage(page.id)}
								/>
							{/if}
						</li>
					{/each}
				</ul>
				<button class="btn btn--full" onclick={addPage}>Add page</button>
				<button class="btn btn--full" onclick={resetLayout}>Reset layout</button>
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
		</div>

		<div class="sidebar__column">
			<section class="sidebar__section">
				<h2>Keyboard controls</h2>
				<KeyboardControlsEditor bindings={kbBindings} onChanged={onBindingChanged} />
				<button class="btn btn--full" onclick={resetBindings}>Reset to defaults</button>
			</section>
		</div>
	</aside>

	<main class="layout">
		<HorizonLayout
			bind:config
			{views}
			{translations}
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
			tabgroupControls={[maximizeButton]}
			{onPopoutClose}
		/>
		{#if config.maximizedView}
			<button class="btn restore" onclick={() => (config.maximizedView = undefined)}>
				Restore layout
			</button>
		{/if}
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: system-ui, sans-serif;
	}

	/* Fluid root font-size: everything sized in rem scales down as the
	   viewport shrinks (vmin so portrait/landscape behave the same),
	   but never gets smaller than 11px or larger than 16px. */
	:global(html) {
		font-size: clamp(0.6875rem, 0.6rem + 0.625vmin, 1rem);
	}

	.app {
		display: flex;
		width: 100vw;
		height: 100vh;
		background: var(--hl-background);
		color: var(--hl-foreground);
	}

	.sidebar {
		width: 270px;
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

	.sidebar__column {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Portrait: the sidebar becomes a horizontal panel on top of the layout
	   instead of a vertical sidebar. Declared after the base rule so the
	   overrides win. */
	@media (orientation: portrait) {
		.app {
			flex-direction: column;
		}

		/* Three fixed columns. The panel itself is capped at a fraction of
		   the viewport height and scrolls, so it never eats the layout. */
		.sidebar {
			width: auto;
			flex-direction: row;
			align-items: stretch;
			flex-wrap: wrap;
			gap: 1.25rem;
			height: 30vh;
			max-height: 30vh;
			padding: 0.75rem 1rem;
			border-right: none;
			border-bottom: 1px solid var(--hl-border);
			overflow: auto;
		}

		.sidebar__column {
			flex: 1 1 0;
			min-width: 11rem;
			min-height: 0;
			overflow-y: auto;
			scrollbar-width: thin;
		}

		.sidebar__column + .sidebar__column {
			border-left: 1px solid var(--hl-border);
			padding-left: 1.25rem;
		}

		.sidebar :global(.kbd-list) {
			columns: 2;
			column-gap: 0.75rem;
		}

		.sidebar :global(.kbd-row) {
			break-inside: avoid;
		}
	}

	.sidebar__brand {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.sidebar__brand h1 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
	}

	.sidebar__brand a {
		font-size: 0.75rem;
		color: var(--hl-muted-foreground);
	}

	.sidebar__brand a:hover {
		color: var(--hl-foreground);
	}

	.sidebar h2 {
		margin: 0 0 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
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
	}

	.page-list li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 1.6rem;
		font-size: 0.75rem;
	}

	.page-list__title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.btn {
		border: 1px solid var(--hl-border);
		background: var(--hl-secondary);
		color: var(--hl-foreground);
		font: inherit;
		font-size: 0.75rem;
		padding: 0.3rem 0.6rem;
		border-radius: var(--hl-radius);
		cursor: pointer;
	}

	.btn:hover {
		background: var(--hl-accent);
	}

	.btn--full {
		width: 100%;
	}

	.select {
		font: inherit;
		font-size: 0.75rem;
		padding: 0.25rem 0.45rem;
		border-radius: var(--hl-radius);
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

	.layout {
		position: relative;
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	.restore {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 10;
		background: var(--hl-popover);
		box-shadow: 0 4px 16px oklch(0 0 0 / 0.2);
	}
</style>
