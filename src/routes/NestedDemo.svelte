<script lang="ts" module>
	import type { Id, LayoutConfig, View } from '$lib/types.js';
	import { SvelteMap } from 'svelte/reactivity';
	import HorizonLayout from '$lib/HorizonLayout.svelte';
	import { themes } from './themes.js';
	import InteractionOptions from './InteractionOptions.svelte';
	import ConstraintOptions from './ConstraintOptions.svelte';
	import { ratioFormats, type RatioFormat } from './LayoutOptions.svelte';
</script>

<script lang="ts">
	// Like the main demo page, but responsive to *this tab's own box* rather
	// than the viewport: the nested layout lives inside a pane that can be any
	// size, so we use a container query instead of an orientation media query.
	let nestedConfig: LayoutConfig = $state({
		root: {
			direction: 'horizontal',
			views: [
				{ tabs: ['nested-overview'], activeTabIndex: 0 },
				{ tabs: ['nested-timeline'], activeTabIndex: 0 }
			],
			splitPoints: [0.4]
		}
	});

	const nestedViews = new SvelteMap<Id, View>([
		['nested-overview', { title: 'Overview', snippet: nestedOverview }],
		['nested-timeline', { title: 'Timeline', snippet: nestedTimeline }]
	]);

	// The nested layout keeps its own theme, independent of the outer one.
	// Pinned to a theme id so reordering the themes list cannot change it.
	let nestedTheme = $state(themes.find((t) => t.id === 'forest')?.id ?? themes.at(-1)!.id);

	// The nested layout also has its own config knobs, independent of the outer one.
	let showSplitRatio = $state(true);
	let disableResizeSplits = $state(false);
	let disableDragAndDrop = $state(false);
	let hideTabBar = $state(false);
	let skipValidation = $state(false);
	let minWidthRatio = $state(0.1);
	let minHeightRatio = $state(0.2);
	let maxDepth = $state(6);
	let ratioFormat = $state<RatioFormat>('percent');

	let formatRatio = $derived(ratioFormats[ratioFormat].format);
	let formatRatioForAria = $derived(ratioFormats[ratioFormat].aria);

	let themeClass = $derived(themes.find((t) => t.id === nestedTheme)!.className);
</script>

{#snippet nestedOverview()}
	<div class="nested-block">
		<h3>Nested layout</h3>
		<p>
			This pane hosts a second, fully interactive HorizonLayout with <strong>its own theme</strong>,
			independent from the outer layout's theme. It shares the same view registry machinery, so tabs
			can be split, dragged and popped out inside it too.
		</p>
	</div>
{/snippet}

{#snippet nestedTimeline()}
	<div class="nested-block">
		<h3>Activity</h3>
		<ul>
			<li>Inner panes support the same keyboard shortcuts as the outer layout.</li>
			<li>Change the inner theme and options in the sidebar to the left.</li>
		</ul>
	</div>
{/snippet}

<div class="nested-root {themeClass}">
	<div class="nested-demo">
		<aside class="nested-sidebar">
			<div class="nested-column">
				<InteractionOptions
					bind:showSplitRatio
					bind:disableResizeSplits
					bind:disableDragAndDrop
					bind:hideTabBar
					bind:skipValidation
					bind:ratioFormat
				/>
			</div>

			<div class="nested-column">
				<section class="nested-section">
					<h2>Theme</h2>
					<select
						id="nested-theme-select"
						class="nested-select"
						value={nestedTheme}
						onchange={(e) => (nestedTheme = (e.currentTarget as HTMLSelectElement).value)}
					>
						{#each themes as theme (theme.id)}
							<option value={theme.id}>{theme.name}</option>
						{/each}
					</select>
				</section>

				<ConstraintOptions
					config={nestedConfig}
					bind:minWidthRatio
					bind:minHeightRatio
					bind:maxDepth
				/>
			</div>
		</aside>

		<div class="nested-demo__layout">
			<HorizonLayout
				bind:config={nestedConfig}
				views={nestedViews}
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
			/>
		</div>
	</div>
</div>

<style>
	.nested-root {
		width: 100%;
		height: 100%;
		/* Container for the queries below; must be an ancestor of everything
		   the queries restyle (container queries never match an element
		   against its own container). */
		container-type: size;
	}

	.nested-demo {
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		background: var(--hl-background);
		color: var(--hl-foreground);
	}

	.nested-demo > .nested-demo__layout {
		flex: 1;
		width: 100%;
		min-width: 0;
		min-height: 0;
	}

	.nested-sidebar {
		width: 230px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 0.85rem;
		box-sizing: border-box;
		border-right: 1px solid var(--hl-border);
		background: var(--hl-card);
		overflow-y: auto;
	}

	/* Narrow tab: become a horizontal panel on top of the layout. Driven by
	   the container's own width, not the viewport: the vertical sidebar needs
	   230px plus a usable layout beside it (~32rem total); below that the
	   layout would be starved. Declared after the base rule so the overrides
	   win. */
	@container (max-width: 32rem) {
		.nested-demo {
			flex-direction: column;
		}

		.nested-sidebar {
			width: auto;
			max-width: none;
			flex-direction: row;
			align-items: stretch;
			flex-wrap: wrap;
			gap: 1.25rem;
			height: 30%;
			max-height: 30%;
			padding: 0.75rem 1rem;
			border-right: none;
			border-bottom: 1px solid var(--hl-border);
			overflow: auto;
		}

		.nested-column {
			flex: 1 1 0;
			min-width: 11rem;
			display: flex;
			flex-direction: column;
			gap: 1rem;
			min-height: 0;
			overflow-y: auto;
			scrollbar-width: thin;
		}

		.nested-column + .nested-column {
			border-left: 1px solid var(--hl-border);
			padding-left: 1.25rem;
		}

		.nested-section {
			padding-bottom: 0;
			border-bottom: none;
		}
	}

	.nested-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-bottom: 0.9rem;
		border-bottom: 1px solid var(--hl-border);
	}

	.nested-section h2 {
		margin: 0 0 0.5rem;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--hl-muted-foreground);
	}

	.nested-select {
		font-size: 0.75rem;
		padding: 0.25rem 0.45rem;
		border-radius: 0.4rem;
		border: 1px solid var(--hl-border);
		background: var(--hl-card);
		color: var(--hl-foreground);
	}

	.nested-demo .nested-demo__layout {
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	.nested-block {
		padding: 0.9rem;
		font-size: 0.8rem;
		color: var(--hl-muted-foreground);
		line-height: 1.5;
	}

	.nested-block h3 {
		margin: 0 0 0.4rem;
		font-size: 0.85rem;
		color: var(--hl-foreground);
	}

	.nested-block ul {
		padding-left: 1.1rem;
		margin: 0.4rem 0 0;
	}

	.nested-block li {
		margin-bottom: 0.25rem;
	}
</style>
