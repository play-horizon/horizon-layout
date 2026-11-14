<!-- @component
A HorizonLayout for the component tests: one view per id, titled "Title of <id>", whose body is a
`ViewBody` (which counts its mounts), with the config bound both ways and English translations.
-->
<script lang="ts">
	import { createRawSnippet, mount, unmount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import HorizonLayout from '#lib/HorizonLayout.svelte';
	import type { Id, KeyboardControls, LayoutConfig, View } from '#lib/types.js';
	import ViewBody from './ViewBody.svelte';

	let {
		config = $bindable(),
		ids,
		keyboardControls,
		minWidthRatio,
		maxDepth
	}: {
		/** The layout, bound both ways. */
		config: LayoutConfig;
		/** The views the layout knows. */
		ids: Id[];
		/** Passed to HorizonLayout when given; its defaults otherwise. */
		keyboardControls?: KeyboardControls;
		/** Passed to HorizonLayout; its default when undefined. */
		minWidthRatio?: number;
		/** Passed to HorizonLayout; its default when undefined. */
		maxDepth?: number;
	} = $props();

	function body(id: Id) {
		return createRawSnippet(() => ({
			render: () => '<div></div>',
			setup: (element) => {
				const instance = mount(ViewBody, { target: element, props: { id } });
				return () => void unmount(instance);
			}
		}));
	}

	const views = $derived(
		new SvelteMap<Id, View>(ids.map((id) => [id, { title: `Title of ${id}`, snippet: body(id) }]))
	);

	const translations = {
		resizePane: (pane: number) => `Resize pane ${pane}`,
		floatingPanel: (title: string) => `${title}, floating`
	};
</script>

{#if keyboardControls}
	<HorizonLayout bind:config {views} {translations} {keyboardControls} {minWidthRatio} {maxDepth} />
{:else}
	<HorizonLayout bind:config {views} {translations} {minWidthRatio} {maxDepth} />
{/if}
