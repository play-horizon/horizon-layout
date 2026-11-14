<!--
@component
An icon-only button of the demo (the tab, tab-group and page-list controls). `label` is both its
accessible name and its tooltip; `icon` is a Mingcute icon component (`~icons/mingcute/…`).
-->
<script lang="ts">
	import type { Component } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';

	let {
		icon: Icon,
		label,
		onclick
	}: {
		icon: Component<SvelteHTMLElements['svg']>;
		label: string;
		onclick: (event: MouseEvent) => void;
	} = $props();
</script>

<button class="icon-button" type="button" {onclick} title={label} aria-label={label}>
	<Icon width="0.75rem" height="0.75rem" aria-hidden="true" />
</button>

<style>
	.icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		padding: 0;
		border: none;
		border-radius: calc(var(--hl-radius) - 0.125rem);
		background: transparent;
		color: var(--hl-muted-foreground);
		cursor: pointer;
	}

	.icon-button:hover {
		background: var(--hl-accent);
		color: var(--hl-foreground);
	}
</style>
