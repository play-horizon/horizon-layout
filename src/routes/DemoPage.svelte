<script lang="ts" module>
	export type PageKind = 'intro' | 'usage' | 'files' | 'config' | 'blank';
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

	const files = [
		{ name: 'src/', depth: 0 },
		{ name: 'lib/', depth: 1 },
		{ name: 'HorizonLayout.svelte', depth: 2 },
		{ name: 'LayoutNode.svelte', depth: 2 },
		{ name: 'Split.svelte', depth: 2 },
		{ name: 'TabGroup.svelte', depth: 2 },
		{ name: 'horizon-layout.css', depth: 2 },
		{ name: 'types.ts', depth: 2 },
		{ name: 'utils.ts', depth: 2 },
		{ name: 'routes/', depth: 1 },
		{ name: 'package.json', depth: 0 }
	];

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
			<li>Pop a tab out into its own window with the button next to its title.</li>
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
