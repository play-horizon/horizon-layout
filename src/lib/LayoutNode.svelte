<!-- @component
One node of the docked layout tree: a Split or a TabGroup, depending on the node's config, with
the layout's settings passed down to it. Internal to HorizonLayout, which renders the root node;
Split renders one for each of its panes.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type {
		Id,
		KeyboardControls,
		LayoutTranslations,
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
		translations,
		tabgroupControls,
		disableResizeSplits,
		disableDragAndDrop,
		isDragging,
		onStartTabDrag,
		onHoverEnter,
		onHoverExit,
		canDrop,
		showSplitRatio,
		minWidthRatio,
		minHeightRatio,
		hideTabBar,
		keyboardControls,
		formatRatio,
		formatRatioForAria,
		baseClass,
		registerTabList
	}: {
		config: NodeConfig;
		views: SvelteMap<Id, View>;
		translations: LayoutTranslations;
		tabgroupControls: Snippet<[Id]>[];
		disableResizeSplits: boolean;
		disableDragAndDrop: boolean;
		onStartTabDrag: (event: DragEvent, tabGroup: TabGroupConfig, tabId: Id) => void;
		onHoverEnter: (tabGroup: TabGroupConfig, target: DropTarget) => void;
		onHoverExit: (tabGroup: TabGroupConfig) => void;
		canDrop: (tabGroup: TabGroupConfig, target: DropTarget) => boolean;
		isDragging: boolean;
		showSplitRatio: boolean;
		minWidthRatio: number;
		minHeightRatio: number;
		hideTabBar: boolean;
		keyboardControls: Required<KeyboardControls>;
		formatRatio: (ratio: number) => string;
		formatRatioForAria: (ratio: number) => number;
		baseClass: string;
		registerTabList: (config: TabGroupConfig, element: HTMLElement) => () => void;
	} = $props();
</script>

{#if nodeConfigType(config) === 'split'}
	<HorizonSplit
		bind:config={config as SplitConfig}
		{views}
		{translations}
		{tabgroupControls}
		{disableResizeSplits}
		{disableDragAndDrop}
		{isDragging}
		{onStartTabDrag}
		{onHoverEnter}
		{onHoverExit}
		{canDrop}
		{showSplitRatio}
		{minWidthRatio}
		{minHeightRatio}
		{hideTabBar}
		{keyboardControls}
		{formatRatio}
		{formatRatioForAria}
		{baseClass}
		{registerTabList}
	></HorizonSplit>
{:else}
	<HorizonTabGroup
		bind:config={config as TabGroupConfig}
		{views}
		{translations}
		disableDrag={disableDragAndDrop}
		{isDragging}
		{onStartTabDrag}
		{onHoverEnter}
		{onHoverExit}
		{canDrop}
		{hideTabBar}
		controls={tabgroupControls}
		keyboardControls={keyboardControls.tabGroupControls}
		baseClass={`${baseClass}-tabgroup`}
		{registerTabList}
	></HorizonTabGroup>
{/if}
