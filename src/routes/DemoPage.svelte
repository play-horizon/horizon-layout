<script lang="ts">
	import type { Id } from '$lib/types.js';

	let {
		accent,
		title,
		id,
		kind = 'standard',
		persistent = false,
		restore
	}: {
		accent: string;
		title: string;
		id: Id;
		kind?: 'standard' | 'explorer' | 'terminal' | 'settings';
		/** Whether this page is locked in the sidebar (cannot be removed). */
		persistent?: boolean;
		/** Called by the in-page restore button to leave the maximized state. */
		restore?: () => void;
	} = $props();

	const files = [
		{ name: 'src', depth: 0, folder: true },
		{ name: 'lib', depth: 1, folder: true },
		{ name: 'HorizonLayout.svelte', depth: 2, folder: false },
		{ name: 'Split.svelte', depth: 2, folder: false },
		{ name: 'TabGroup.svelte', depth: 2, folder: false },
		{ name: 'utils.ts', depth: 2, folder: false },
		{ name: 'routes', depth: 0, folder: false },
		{ name: 'package.json', depth: 0, folder: false }
	];

	const settings = [
		{ label: 'Enable glass blur', value: true },
		{ label: 'Animate layout changes', value: true },
		{ label: 'Confirm before closing panes', value: false },
		{ label: 'Sync layout across windows', value: false }
	];
</script>

<div class="demo-page" style:--page-accent={accent}>
	<header class="demo-page__header">
		<span class="demo-page__dot" style:background-color={accent}></span>
		<h2 class="demo-page__title">{title}</h2>
		<button class="demo-page__restore" onclick={() => restore?.()} title="Restore layout">🗗</button>
		<span class="demo-page__id">#{id}</span>
	</header>

	{#if kind === 'terminal'}
		<div class="demo-page__terminal">
			<p><span class="prompt">➜</span> horizon-layout --demo</p>
			<p>Rendering panes… <span class="ok">OK</span></p>
			<p>Dropping tabs between panes… <span class="ok">OK</span></p>
			<p>Try it: drag this tab onto another pane.</p>
			<p><span class="prompt">➜</span> <span class="cursor"></span></p>
		</div>
	{:else if kind === 'explorer'}
		<ul class="demo-page__tree">
			{#each files as file (file.name)}
				<li style:padding-left={`${0.5 + file.depth * 0.9}rem`}>
					{file.folder ? '📁' : '📄'}
					{file.name}
				</li>
			{/each}
		</ul>
	{:else if kind === 'settings'}
		<ul class="demo-page__settings">
			{#each settings as setting (setting.label)}
				<li>
					<span>{setting.label}</span>
					<span class="toggle" class:toggle--on={setting.value}></span>
				</li>
			{/each}
		</ul>
		<p class="demo-page__note">
			Real options live in the sidebar: theme, pages, keyboard controls and the split-percentage
			toggle.
		</p>
	{:else}
		<section class="demo-page__body">
			<p>
				This is a demo page. Drag its tab to reorder, split or move it between panes. Use the ⤢
				button in its tab to pop it out into a separate window, or the ⛶ button in the pane's
				toolbar to maximize it.
			</p>
			<div class="demo-page__chips">
				<span class="chip">{title}</span>
				<span class="chip">id: {id}</span>
			</div>
			{#if persistent}
				<p class="demo-page__note">This page is locked: it cannot be removed from the sidebar.</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.demo-page {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: auto;
		background: linear-gradient(
			160deg,
			color-mix(in oklch, var(--page-accent) 22%, var(--hl-background)),
			var(--hl-background) 65%
		);
	}

	.demo-page__header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.85rem 1rem;
		border-bottom: 1px solid var(--hl-border);
	}

	.demo-page__dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 100vmax;
	}

	.demo-page__title {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--hl-foreground);
	}

	.demo-page__restore {
		margin-left: auto;
		border: none;
		background: transparent;
		color: var(--hl-muted-foreground);
		cursor: pointer;
		font-size: 0.75rem;
	}

	.demo-page__restore:hover {
		color: var(--hl-primary);
	}

	.demo-page__id {
		font-size: 0.7rem;
		color: var(--hl-muted-foreground);
		font-variant-numeric: tabular-nums;
	}

	.demo-page__body {
		flex: 1;
		padding: 1rem;
		color: var(--hl-muted-foreground);
		font-size: 0.8rem;
		line-height: 1.5;
	}

	.demo-page__body p {
		margin-top: 0;
	}

	.demo-page__chips {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-top: 0.8rem;
	}

	.chip {
		padding: 0.15rem 0.5rem;
		border-radius: 100vmax;
		font-size: 0.7rem;
		background: color-mix(in oklch, var(--page-accent) 18%, transparent);
		color: var(--hl-foreground);
		border: 1px solid color-mix(in oklch, var(--page-accent) 35%, transparent);
	}

	.demo-page__note {
		margin-top: 0.8rem;
		color: var(--page-accent);
	}

	.demo-page__terminal {
		flex: 1;
		padding: 1rem;
		font-family: ui-monospace, monospace;
		font-size: 0.78rem;
		color: var(--hl-foreground);
	}

	.demo-page__terminal p {
		margin: 0.2rem 0;
	}

	.prompt {
		color: var(--hl-primary);
	}

	.ok {
		color: oklch(0.72 0.16 155);
	}

	.cursor {
		display: inline-block;
		width: 0.55rem;
		height: 0.95rem;
		background: var(--hl-foreground);
		vertical-align: text-bottom;
		animation: demo-blink 1.1s steps(1) infinite;
	}

	@keyframes demo-blink {
		50% {
			opacity: 0;
		}
	}

	.demo-page__tree {
		list-style: none;
		margin: 0;
		padding: 0.9rem;
		font-family: ui-monospace, monospace;
		font-size: 0.78rem;
		color: var(--hl-muted-foreground);
	}

	.demo-page__tree li {
		padding: 0.15rem 0.3rem;
		border-radius: 0.3rem;
	}

	.demo-page__tree li:hover {
		background: color-mix(in oklch, var(--page-accent) 14%, transparent);
	}

	.demo-page__settings {
		list-style: none;
		margin: 0;
		padding: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--hl-muted-foreground);
	}

	.demo-page__settings li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.35rem 0.5rem;
		border-radius: 0.4rem;
		background: var(--hl-secondary);
	}

	.toggle {
		width: 1.6rem;
		height: 0.9rem;
		border-radius: 100vmax;
		background: var(--hl-border);
		position: relative;
		flex-shrink: 0;
	}

	.toggle::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 100vmax;
		background: var(--hl-muted-foreground);
	}

	.toggle--on {
		background: color-mix(in oklch, var(--page-accent) 70%, transparent);
	}

	.toggle--on::after {
		left: auto;
		right: 2px;
		background: var(--hl-foreground);
	}
</style>
