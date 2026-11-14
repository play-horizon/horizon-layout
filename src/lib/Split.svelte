<!-- @component
A split: its panes side by side (`horizontal`) or stacked (`vertical`), each a LayoutNode, with a
resize handle between each two of them, moved with the pointer or the split keyboard controls, and
an optional ratio label. Each handle is a WAI-ARIA window splitter: a focusable `separator` whose
value is its position in the split and which controls the pane before it, its primary pane.
Internal to HorizonLayout, rendered by LayoutNode.
-->
<script lang="ts">
	import type { SvelteMap } from 'svelte/reactivity';
	import type {
		View,
		Id,
		SplitConfig,
		KeyboardControls,
		LayoutTranslations,
		TabGroupConfig
	} from './types.ts';
	import { findControl, roundSplitPoint } from './internal-utils.ts';
	import HorizonLayoutNode from './LayoutNode.svelte';
	import { onDestroy, type Snippet } from 'svelte';
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
		config: SplitConfig;
		views: SvelteMap<Id, View>;
		translations: LayoutTranslations;
		tabgroupControls: Snippet<[Id]>[];
		disableResizeSplits: boolean;
		disableDragAndDrop: boolean;
		isDragging: boolean;
		onStartTabDrag: (event: DragEvent, tabGroup: TabGroupConfig, tabId: Id) => void;
		onHoverEnter: (tabGroup: TabGroupConfig, target: DropTarget) => void;
		onHoverExit: (tabGroup: TabGroupConfig) => void;
		canDrop: (tabGroup: TabGroupConfig, target: DropTarget) => boolean;
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

	let splitContainer = $state<HTMLElement | null>(null);

	const uid = $props.id();

	/** The id of the pane at `index`, the primary pane of the handle after it. */
	function paneId(index: number): string {
		return `${uid}-pane-${index}`;
	}

	let activeResizer = $state<number | null>(null);

	let isHorizontal = $derived(config.direction === 'horizontal');
	// A separator's orientation is its own: the handle between panes side by side is vertical.
	let handleOrientation: SplitConfig['direction'] = $derived(
		isHorizontal ? 'vertical' : 'horizontal'
	);
	let minRatio = $derived(isHorizontal ? minWidthRatio : minHeightRatio);

	let posConstraints = $derived(
		config.splitPoints.map((_, i) => ({
			min: (config.splitPoints[i - 1] ?? 0) + minRatio,
			max: (config.splitPoints[i + 1] ?? 1) - minRatio
		}))
	);

	let splitRatioStyles = $derived(
		config.splitPoints.map((_, i) => {
			const ratio = config.splitPoints[i] ?? 0;
			return isHorizontal ? `left: ${ratio * 100}%;` : `top: ${ratio * 100}%;`;
		})
	);

	// Ends the resize in progress: one at a time, a new press ending the one before, so a gesture
	// whose end was missed can't linger.
	let endResize: (() => void) | null = null;
	onDestroy(() => endResize?.());

	function startResize(event: PointerEvent, index: number) {
		if (disableResizeSplits || event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		endResize?.();

		const handle = event.currentTarget as HTMLElement;
		const { pointerId } = event;
		const rect = splitContainer!.getBoundingClientRect();

		const move = (moveEvent: PointerEvent) => {
			if (moveEvent.pointerId !== pointerId) return;
			const size = isHorizontal ? rect.width : rect.height;
			if (size <= 0) return;
			const offset = isHorizontal ? moveEvent.clientX - rect.left : moveEvent.clientY - rect.top;
			const { min, max } = posConstraints[index]!;
			const clamped = roundSplitPoint(Math.min(Math.max(offset / size, min), max));
			if (clamped !== config.splitPoints[index]) config.splitPoints[index] = clamped;
		};
		// Fired after pointerup and pointercancel, and whenever else the handle loses the capture.
		const end = (endEvent: PointerEvent) => {
			if (endEvent.pointerId === pointerId) endResize?.();
		};
		handle.addEventListener('pointermove', move);
		handle.addEventListener('lostpointercapture', end);
		endResize = () => {
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('lostpointercapture', end);
			if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
			activeResizer = null;
			endResize = null;
		};
		handle.setPointerCapture(pointerId);
		activeResizer = index;
	}

	function handleKeyDown(event: KeyboardEvent, index: number) {
		const control = findControl(keyboardControls.splitControls, event);
		if (!control) return;
		event.preventDefault();
		event.stopPropagation();
		control.action({ config, index }, event);
	}
</script>

<div
	class="{baseClass}-split {baseClass}-split--{config.direction}"
	style="display: flex !important;"
	bind:this={splitContainer}
>
	{#each config.views as view, i (view)}
		{@const splitPoint = config.splitPoints[i]}
		<div
			id={paneId(i)}
			class="{baseClass}-split__pane {baseClass}-split__pane--{config.direction}"
			style={`flex: ${(splitPoint ?? 1) - (config.splitPoints[i - 1] ?? 0)} 1 0 !important;`}
		>
			<HorizonLayoutNode
				bind:config={config.views[i]!}
				{views}
				{translations}
				{tabgroupControls}
				{disableResizeSplits}
				{disableDragAndDrop}
				{onStartTabDrag}
				{onHoverEnter}
				{onHoverExit}
				{canDrop}
				{isDragging}
				{showSplitRatio}
				{minWidthRatio}
				{minHeightRatio}
				{hideTabBar}
				{keyboardControls}
				{formatRatio}
				{formatRatioForAria}
				{baseClass}
				{registerTabList}
			></HorizonLayoutNode>
		</div>

		{#if i < config.splitPoints.length}
			{@const isActive = activeResizer === i}
			{@const constraints = posConstraints[i]!}
			<div
				class="{baseClass}-split__resizer {baseClass}-split__resizer--{config.direction}{isActive
					? ` ${baseClass}-split__resizer--active`
					: ''}"
			>
				<!-- A focusable separator is a widget (WAI-ARIA window splitter), which Svelte's a11y
				checks take for the static separator role. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
				<span
					class="{baseClass}-split__resizer-handle {baseClass}-split__resizer-handle--{config.direction}{isActive
						? ` ${baseClass}-split__resizer-handle--active`
						: ''}"
					role="separator"
					tabindex={0}
					aria-label={translations.resizePane(i + 1)}
					aria-controls={paneId(i)}
					aria-orientation={handleOrientation}
					aria-valuemin={formatRatioForAria(constraints.min)}
					aria-valuemax={formatRatioForAria(constraints.max)}
					aria-valuenow={formatRatioForAria(splitPoint!)}
					aria-valuetext={formatRatio(splitPoint!)}
					onpointerdown={(event) => startResize(event, i)}
					onfocus={() => {
						if (!disableResizeSplits) activeResizer = i;
					}}
					onblur={() => (activeResizer = null)}
					onkeydown={(event) => handleKeyDown(event, i)}
				></span>
			</div>

			{#if showSplitRatio}
				<div
					class="{baseClass}-split__ratio {baseClass}-split__ratio--{config.direction}{isActive
						? ` ${baseClass}-split__ratio--active`
						: ''}"
					style={splitRatioStyles[i]}
				>
					{formatRatio(splitPoint!)}
				</div>
			{/if}
		{/if}
	{/each}
</div>
