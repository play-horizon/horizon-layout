<!-- @component
A floating group: a tab group in a frame placed over the docked layout, inside its box. The tab
bar's background moves it, its edges and corners resize it, and its tabs drag into the layout like
any other tab. The frame itself is focusable and runs the `floatingControls` (move and resize with
the keyboard); its tab list runs the tab-group controls. Internal to HorizonLayout, which owns the
list of floating groups and their stacking order.
-->
<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import type { SvelteMap } from 'svelte/reactivity';
	import HorizonTabGroup from './TabGroup.svelte';
	import { clampFloatingRect, resizedRect, type ResizeEdge } from './floating.ts';
	import { getModifier } from './internal-utils.ts';
	import type { DropTarget } from './internal-types.ts';
	import type {
		FloatingControlData,
		FloatingGroupConfig,
		FloatingRect,
		Id,
		KeyboardControl,
		LayoutTranslations,
		Size,
		TabGroupConfig,
		View
	} from './types.ts';

	let {
		config = $bindable(),
		bounds,
		zIndex,
		topZIndex,
		views,
		translations,
		tabgroupControls,
		disableDragAndDrop,
		isDragging,
		onStartTabDrag,
		onHoverEnter,
		onHoverExit,
		canDrop,
		tabGroupControls,
		floatingControls,
		baseClass,
		registerTabList,
		onRaise
	}: {
		config: FloatingGroupConfig;
		/** The size of the layout the group floats in; zero until it is measured. */
		bounds: Size;
		/** The group's place in the stacking order, 1 for the bottom one. */
		zIndex: number;
		/** The z-index above every floating group, which a focused group is shown at. */
		topZIndex: number;
		views: SvelteMap<Id, View>;
		translations: LayoutTranslations;
		tabgroupControls: Snippet<[Id]>[];
		disableDragAndDrop: boolean;
		isDragging: boolean;
		onStartTabDrag: (event: DragEvent, tabGroup: TabGroupConfig, tabId: Id) => void;
		onHoverEnter: (tabGroup: TabGroupConfig, target: DropTarget) => void;
		onHoverExit: (tabGroup: TabGroupConfig) => void;
		canDrop: (tabGroup: TabGroupConfig, target: DropTarget) => boolean;
		tabGroupControls: KeyboardControl<TabGroupConfig>[];
		floatingControls: KeyboardControl<FloatingControlData>[];
		baseClass: string;
		registerTabList: (config: TabGroupConfig, element: HTMLElement) => () => void;
		/** Puts this group on top of the other floating groups. */
		onRaise: (group: FloatingGroupConfig) => void;
	} = $props();

	const RESIZE_EDGES: Record<ResizeEdge, string> = {
		n: 'top: -4px; left: 8px; right: 8px; height: 8px; cursor: ns-resize;',
		s: 'bottom: -4px; left: 8px; right: 8px; height: 8px; cursor: ns-resize;',
		e: 'right: -4px; top: 8px; bottom: 8px; width: 8px; cursor: ew-resize;',
		w: 'left: -4px; top: 8px; bottom: 8px; width: 8px; cursor: ew-resize;',
		ne: 'top: -4px; right: -4px; width: 12px; height: 12px; cursor: nesw-resize;',
		sw: 'bottom: -4px; left: -4px; width: 12px; height: 12px; cursor: nesw-resize;',
		nw: 'top: -4px; left: -4px; width: 12px; height: 12px; cursor: nwse-resize;',
		se: 'bottom: -4px; right: -4px; width: 12px; height: 12px; cursor: nwse-resize;'
	};

	let shown = $derived(clampFloatingRect(config.rect, bounds));
	let title = $derived(views.get(config.tabs[config.activeTabIndex]!)?.title ?? '');
	let focused = $state(false);

	// Ends the gesture in progress (a move or a resize): one at a time, a new press ending the one
	// before, so a gesture whose end was missed can't linger.
	let endGesture: (() => void) | null = null;
	onDestroy(() => endGesture?.());

	function startGesture(
		event: PointerEvent,
		apply: (start: FloatingRect, dx: number, dy: number) => FloatingRect
	) {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		endGesture?.();
		onRaise(config);

		// The pressed element captures the pointer, so the gesture follows it anywhere, over an
		// iframe too, and hears its release.
		const element = event.currentTarget as HTMLElement;
		const start = shown;
		const origin = { x: event.clientX, y: event.clientY };
		const { pointerId } = event;

		const move = (moveEvent: PointerEvent) => {
			if (moveEvent.pointerId !== pointerId) return;
			// No button held: the release happened where the gesture couldn't hear it.
			if ((moveEvent.buttons & 1) === 0) {
				endGesture?.();
				return;
			}
			const next = apply(start, moveEvent.clientX - origin.x, moveEvent.clientY - origin.y);
			const { x, y, width, height } = config.rect;
			if (next.x !== x || next.y !== y || next.width !== width || next.height !== height) {
				config.rect = next;
			}
		};
		// Fired after pointerup and pointercancel, and whenever else the element loses the capture.
		const end = (endEvent: PointerEvent) => {
			if (endEvent.pointerId === pointerId) endGesture?.();
		};
		element.addEventListener('pointermove', move);
		element.addEventListener('lostpointercapture', end);
		endGesture = () => {
			element.removeEventListener('pointermove', move);
			element.removeEventListener('lostpointercapture', end);
			if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
			endGesture = null;
		};
		element.setPointerCapture(pointerId);
	}

	function startMove(event: PointerEvent) {
		startGesture(event, (start, dx, dy) =>
			clampFloatingRect({ ...start, x: start.x + dx, y: start.y + dy }, bounds)
		);
	}

	function startResize(event: PointerEvent, edge: ResizeEdge) {
		startGesture(event, (start, dx, dy) => resizedRect(start, edge, dx, dy, bounds));
	}

	function handleKeyDown(event: KeyboardEvent) {
		// Only on the frame itself: keys pressed in the tab list or the content are theirs.
		if (event.target !== event.currentTarget) return;
		const modifier = getModifier(event);
		for (const control of floatingControls) {
			for (const shortcut of control.shortcuts) {
				if (modifier === (shortcut.modifier ?? null) && event.key === shortcut.key) {
					event.preventDefault();
					event.stopPropagation();
					control.action({ config, bounds }, event);
					return;
				}
			}
		}
	}
</script>

<div
	class="{baseClass}-floating{focused ? ` ${baseClass}-floating--focused` : ''}"
	role="dialog"
	aria-label={translations.floatingPanel(title)}
	tabindex={0}
	style:position="absolute"
	style:left="{shown.x}px"
	style:top="{shown.y}px"
	style:width="{shown.width}px"
	style:height="{shown.height}px"
	style:z-index={focused ? topZIndex : zIndex}
	style:pointer-events="auto"
	onpointerdown={() => onRaise(config)}
	onkeydown={handleKeyDown}
	onfocusin={() => (focused = true)}
	onfocusout={(event) => {
		if (
			!(event.relatedTarget instanceof Node) ||
			!event.currentTarget.contains(event.relatedTarget)
		) {
			focused = false;
		}
	}}
>
	<HorizonTabGroup
		bind:config
		{views}
		disableDrag={disableDragAndDrop}
		{isDragging}
		{onStartTabDrag}
		{onHoverEnter}
		{onHoverExit}
		{canDrop}
		hideTabBar={false}
		controls={tabgroupControls}
		keyboardControls={tabGroupControls}
		baseClass={`${baseClass}-tabgroup`}
		onMoveStart={startMove}
		{registerTabList}
	></HorizonTabGroup>
	{#each Object.entries(RESIZE_EDGES) as [edge, style] (edge)}
		<div
			class="{baseClass}-floating__resizer {baseClass}-floating__resizer--{edge}"
			style="position: absolute; touch-action: none; {style}"
			aria-hidden="true"
			onpointerdown={(event) => startResize(event, edge as ResizeEdge)}
		></div>
	{/each}
</div>
