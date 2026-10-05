<script lang="ts">
	import type { LayoutConfig } from '#lib/types.js';
	import InteractionOptions from './InteractionOptions.svelte';
	import ConstraintOptions from './ConstraintOptions.svelte';
	import type { RatioFormat } from './ratio-formats.js';

	// Shared config sidebar for a HorizonLayout instance: interaction toggles,
	// split constraints and the split-ratio display format.
	let {
		config,
		showSplitRatio = $bindable(),
		disableResizeSplits = $bindable(),
		disableDragAndDrop = $bindable(),
		hideTabBar = $bindable(),
		skipValidation = $bindable(),
		minWidthRatio = $bindable(),
		minHeightRatio = $bindable(),
		maxDepth = $bindable(),
		ratioFormat = $bindable()
	}: {
		config: LayoutConfig;
		showSplitRatio: boolean;
		disableResizeSplits: boolean;
		disableDragAndDrop: boolean;
		hideTabBar: boolean;
		skipValidation: boolean;
		minWidthRatio: number;
		minHeightRatio: number;
		maxDepth: number;
		ratioFormat: RatioFormat;
	} = $props();
</script>

<InteractionOptions
	bind:showSplitRatio
	bind:disableResizeSplits
	bind:disableDragAndDrop
	bind:hideTabBar
	bind:skipValidation
	bind:ratioFormat
/>
<ConstraintOptions {config} bind:minWidthRatio bind:minHeightRatio bind:maxDepth />
