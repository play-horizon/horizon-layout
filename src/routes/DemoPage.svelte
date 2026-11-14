<!--
@component
The content of one page of the main layout, chosen by `kind`; the `config` page shows the live
layout config.
-->
<script lang="ts" module>
	/**
	 * What a page shows: an intro, usage code, a file tree, the live config, the floating panel's
	 * guide, or nothing.
	 */
	export type PageKind = 'intro' | 'usage' | 'files' | 'config' | 'floating' | 'blank';
</script>

<script lang="ts">
	import type { LayoutConfig } from '#lib/types.js';

	let {
		kind,
		config
	}: {
		kind: PageKind;
		/** Returns the live layout config, shown by the `config` page. */
		config: () => LayoutConfig;
	} = $props();

	// The library's own source tree, for the `files` page (file names are unique in it).
	const files = [
		{ name: 'src/', depth: 0 },
		{ name: 'lib/', depth: 1 },
		{ name: 'FloatingGroup.svelte', depth: 2 },
		{ name: 'HorizonLayout.svelte', depth: 2 },
		{ name: 'LayoutNode.svelte', depth: 2 },
		{ name: 'PopoutContent.svelte', depth: 2 },
		{ name: 'Split.svelte', depth: 2 },
		{ name: 'TabGroup.svelte', depth: 2 },
		{ name: 'floating.ts', depth: 2 },
		{ name: 'horizon-layout.css', depth: 2 },
		{ name: 'index.ts', depth: 2 },
		{ name: 'internal-types.ts', depth: 2 },
		{ name: 'internal-utils.ts', depth: 2 },
		{ name: 'popout-mirror.ts', depth: 2 },
		{ name: 'reconcile.ts', depth: 2 },
		{ name: 'translations.ts', depth: 2 },
		{ name: 'types.ts', depth: 2 },
		{ name: 'utils.ts', depth: 2 },
		{ name: 'routes/', depth: 1 },
		{ name: 'package.json', depth: 0 }
	];

	const floatingUsage = `import { findTabGroup, floatView } from 'horizon-layout';

// Bring the docs to the front if they are open, float them otherwise.
const group = findTabGroup(config, 'docs');
if (group) group.activeTabIndex = group.tabs.indexOf('docs');
else floatView(config, 'docs', { x: 80, y: 60, width: 420, height: 520 });`;

	const usage = `<script lang="ts">
  import { HorizonLayout } from 'horizon-layout';
  import { SvelteMap } from 'svelte/reactivity';
  import type { LayoutConfig } from 'horizon-layout';
  import 'horizon-layout/horizon-layout.css';

  const views = new SvelteMap([
    ['editor', { title: 'Editor', snippet: editorSnippet }],
    ['preview', { title: 'Preview', snippet: previewSnippet }]
  ]);

  let config = $state<LayoutConfig>({
    root: {
      direction: 'horizontal',
      views: [
        { tabs: ['editor'], activeTabIndex: 0 },
        { tabs: ['preview'], activeTabIndex: 0 }
      ],
      splitPoints: [0.5]
    }
  });
</${'script'}>

{#snippet editorSnippet()}<MyEditor />{/snippet}
{#snippet previewSnippet()}<MyPreview />{/snippet}

<HorizonLayout bind:config {views} />`;
</script>

<div class="page">
	{#if kind === 'intro'}
		<p>Every pane here is a tab group. Things to try:</p>
		<ul>
			<li>Drag a tab to reorder it, or drop it on the edge of another pane to split that pane.</li>
			<li>Drag the line between two panes to resize them.</li>
			<li>
				Float a tab over the layout, or pop it out into its own window, with the buttons next to its
				title.
			</li>
			<li>
				Maximize a pane with the button at the end of its tab bar; Escape restores the layout.
			</li>
			<li>Click a tab bar, then use the keyboard shortcuts listed in the sidebar.</li>
		</ul>
		<pre><code>pnpm add horizon-layout</code></pre>
	{:else if kind === 'usage'}
		<pre><code>{usage}</code></pre>
	{:else if kind === 'files'}
		<ul class="tree">
			{#each files as file (file.name)}
				<li style:padding-left="{file.depth * 1.25}ch">{file.name}</li>
			{/each}
		</ul>
	{:else if kind === 'floating'}
		<p>This panel floats over the layout, and is saved with it in <code>config.floating</code>.</p>
		<ul>
			<li>Drag its tab bar to move it, and an edge or a corner to resize it.</li>
			<li>Drag its tab onto a pane to dock it back, like any tab.</li>
			<li>Float any tab with the button next to its title.</li>
			<li>
				With the keyboard: focus the panel's frame (Tab), then the arrow keys move it and Alt +
				arrows resize it. In its tab bar, Ctrl + arrows and Alt + arrows dock its tab.
			</li>
		</ul>
		<pre><code>{floatingUsage}</code></pre>
	{:else if kind === 'config'}
		<p>The <code>config</code> bound to the layout, updated as you change it.</p>
		<pre><code>{JSON.stringify(config(), null, 2)}</code></pre>
	{:else}
		<p class="muted">Empty page.</p>
	{/if}
</div>

<style>
	.page {
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		overflow: auto;
		padding: 0.75rem 1rem;
		font-size: 0.8rem;
		line-height: 1.55;
		color: var(--hl-foreground);
	}

	p {
		margin: 0 0 0.6rem;
	}

	ul {
		margin: 0 0 0.75rem;
		padding-left: 1.1rem;
	}

	li + li {
		margin-top: 0.2rem;
	}

	pre {
		margin: 0;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--hl-border);
		border-radius: var(--hl-radius);
		background: var(--hl-background);
		overflow: auto;
	}

	code {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
	}

	.tree {
		list-style: none;
		margin: 0;
		padding: 0;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
	}

	.tree li + li {
		margin-top: 0;
	}

	.muted {
		color: var(--hl-muted-foreground);
	}
</style>
