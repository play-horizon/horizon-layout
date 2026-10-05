<script lang="ts">
	import type { Snippet } from 'svelte';
	import type {
		Id,
		KeyboardControls,
		SplitConfig,
		View,
		TabGroupConfig,
		NodeConfig
	} from './types.ts';
	import { nodeConfigType } from './utils.ts';
	import HorizonSplit from './Split.svelte';
	import HorizonTabGroup from './TabGroup.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type { DropTarget } from './internal-types.ts';

	let {
		config = $bindable(),
		views,
		tabgroupControls,
		disableResizeSplits,
		disableDragAndDrop,
		isDragging,
		onStartTabDrag,
		onHoverEnter,
		onHoverExit,
		canDrop,
		remainingDepth,
		showSplitRatio,
		minWidthRatio,
		minHeightRatio,
		hideTabBar,
		keyboardControls,
		formatRatio,
		formatRatioForAria,
		baseClass
	}: {
		config: NodeConfig;
		views: SvelteMap<Id, View>;
		tabgroupControls: Snippet<[Id]>[];
		disableResizeSplits: boolean;
		disableDragAndDrop: boolean;
		onStartTabDrag: (event: DragEvent, tabGroup: TabGroupConfig, tabId: Id) => void;
		onHoverEnter: (tabGroup: TabGroupConfig, target: DropTarget) => void;
		onHoverExit: (tabGroup: TabGroupConfig) => void;
		canDrop: (tabGroup: TabGroupConfig, target: DropTarget) => boolean;
		isDragging: boolean;
		remainingDepth: number;
		showSplitRatio: boolean;
		minWidthRatio: number;
		minHeightRatio: number;
		hideTabBar: boolean;
		keyboardControls: KeyboardControls;
		formatRatio: (ratio: number) => string;
		formatRatioForAria: (ratio: number) => number;
		baseClass: string;
	} = $props();
</script>

{#if nodeConfigType(config) === 'split'}
	<HorizonSplit
		bind:config={config as SplitConfig}
		{views}
		{tabgroupControls}
		{disableResizeSplits}
		{disableDragAndDrop}
		{isDragging}
		{onStartTabDrag}
		{onHoverEnter}
		{onHoverExit}
		{canDrop}
		remainingDepth={remainingDepth - 1}
		{showSplitRatio}
		{minWidthRatio}
		{minHeightRatio}
		{hideTabBar}
		{keyboardControls}
		{formatRatio}
		{formatRatioForAria}
		{baseClass}
	></HorizonSplit>
{:else}
	<HorizonTabGroup
		bind:config={config as TabGroupConfig}
		{views}
		disableDrag={disableDragAndDrop}
		{isDragging}
		{onStartTabDrag}
		{onHoverEnter}
		{onHoverExit}
		{canDrop}
		{remainingDepth}
		{hideTabBar}
		controls={tabgroupControls}
		keyboardControls={keyboardControls.tabGroupControls ?? []}
		baseClass={`${baseClass}-tabgroup`}
	></HorizonTabGroup>
{/if}
