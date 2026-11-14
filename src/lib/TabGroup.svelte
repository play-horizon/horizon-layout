<!-- @component
A tab group: its tab bar (the tab list, each tab's controls and the group's shared controls) and
the active tab's view. The tab list takes the focus and runs the tab-group keyboard controls; tabs
drag out with HTML5 drag and drop, and while a tab is dragged the group shows drop zones (between
its tabs, and on its four sides to split it) and reports the one under the pointer to the layout.
Internal to HorizonLayout, rendered by LayoutNode for a docked group and by FloatingGroup.
-->
<script lang="ts">
	import type { Id, KeyboardControl, TabGroupConfig, View } from './types.ts';
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import { getModifier } from './internal-utils.ts';
	import type { SvelteMap } from 'svelte/reactivity';
	import type { DropSide, DropTarget } from './internal-types.ts';

	let {
		config = $bindable(),
		views,
		disableDrag,
		isDragging,
		onStartTabDrag,
		onHoverEnter,
		onHoverExit,
		canDrop,
		remainingDepth,
		hideTabBar,
		controls,
		keyboardControls,
		baseClass,
		onMoveStart,
		registerTabList
	}: {
		config: TabGroupConfig;
		views: SvelteMap<Id, View>;
		disableDrag: boolean;
		isDragging: boolean;
		onStartTabDrag: (event: DragEvent, tabGroup: TabGroupConfig, tabId: Id) => void;
		onHoverEnter: (tabGroup: TabGroupConfig, target: DropTarget) => void;
		onHoverExit: (tabGroup: TabGroupConfig) => void;
		canDrop: (tabGroup: TabGroupConfig, target: DropTarget) => boolean;
		remainingDepth: number;
		hideTabBar: boolean;
		controls: Snippet<[Id]>[];
		keyboardControls: KeyboardControl<TabGroupConfig>[];
		baseClass: string;
		/** Set on a floating group: a press on the tab bar outside the tabs and controls moves it. */
		onMoveStart?: (event: PointerEvent) => void;
		/** Records this group's tab list element, so the layout can move focus to it. */
		registerTabList: (config: TabGroupConfig, element: HTMLElement) => () => void;
	} = $props();

	// Focus stays on the tab list, which points at the active tab with `aria-activedescendant`
	// (the WAI-ARIA tabs pattern's alternative to moving focus between the tabs): the layout
	// focuses a group through its tab list, and the keyboard controls run there.
	const uid = $props.id();
	const panelId = `${uid}-panel`;
	let activeTab = $derived(config.tabs[config.activeTabIndex]);
	let hasTabPanel = $derived(!hideTabBar && activeTab !== undefined);

	/** The id of the element of the tab at `index`, which the tab list and the panel refer to. */
	function tabElementId(index: number): string {
		return `${uid}-tab-${index}`;
	}

	function handleTabBarPointerDown(event: PointerEvent) {
		if (!onMoveStart || !(event.target instanceof Element)) return;
		if (event.target.closest(`[role="tab"], .${CSS.escape(baseClass)}__controls`)) return;
		onMoveStart(event);
	}

	function handleKeyDown(event: KeyboardEvent) {
		const modifier = getModifier(event);
		for (const control of keyboardControls) {
			for (const shortcut of control.shortcuts) {
				if (modifier === (shortcut.modifier ?? null) && event.key === shortcut.key) {
					event.preventDefault();
					event.stopPropagation();
					control.action(config, event);
					return;
				}
			}
		}
	}

	function startTabDrag(event: DragEvent, tabId: Id) {
		if (!event.dataTransfer) return;
		event.stopPropagation();
		event.dataTransfer.dropEffect = 'move';
		const currentTarget = event.currentTarget as HTMLElement;
		event.dataTransfer.setDragImage(
			currentTarget,
			currentTarget.offsetWidth / 2,
			currentTarget.offsetHeight / 2
		);
		onStartTabDrag(event, config, tabId);
	}

	// Track which target (if any) we are currently hovering over and which config
	// object we reported to the parent, so we can reliably fire the exit callback
	// even if the component's config reference changes mid-drag.
	let hoverData: {
		target: DropTarget;
		reportedConfig: TabGroupConfig;
	} | null = $state(null);

	function handleHoverExit() {
		if (!hoverData) return;
		const reported = hoverData.reportedConfig;
		hoverData = null;
		onHoverExit(reported);
	}

	function handleHoverEnter(target: DropTarget) {
		if (!isDragging || !canDrop(config, target)) {
			handleHoverExit();
			return;
		}

		if (
			hoverData &&
			hoverData.reportedConfig === config &&
			hoverData.target.side === target.side &&
			hoverData.target.tabIndex === target.tabIndex
		) {
			return;
		}

		handleHoverExit();
		hoverData = { target, reportedConfig: config };
		onHoverEnter(config, target);
	}

	function handleDragOver(event: DragEvent, target: DropTarget) {
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer!.dropEffect = 'move';
		handleHoverEnter(target);
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		handleHoverExit();
	}

	// Re-emit hover events if config or drag state changes while hovering,
	// so the parent always has up-to-date references.
	$effect(() => {
		void config;
		void isDragging;
		void remainingDepth;
		if (!isDragging) {
			handleHoverExit();
			return;
		}
		const target = untrack(() => hoverData?.target);
		if (target) handleHoverEnter(target);
	});

	onDestroy(handleHoverExit);
</script>

<section class={baseClass}>
	{#if !hideTabBar}
		<!-- Moving a floating group with the pointer (a touch mustn't pan instead, which would cancel
		the move); the keyboard moves it from its frame. -->
		<div
			class="{baseClass}__tab-bar"
			role="presentation"
			style:touch-action={onMoveStart ? 'none' : undefined}
			onpointerdown={handleTabBarPointerDown}
		>
			<!-- Tab list - keyboard navigation is handled on the list container. -->
			<div
				role="tablist"
				tabindex={0}
				class="{baseClass}__tabs"
				style:touch-action={onMoveStart ? 'none' : undefined}
				aria-activedescendant={activeTab === undefined
					? undefined
					: tabElementId(config.activeTabIndex)}
				onkeydown={handleKeyDown}
				{@attach (element) => registerTabList(config, element)}
			>
				{#each config.tabs as tabId, index (tabId)}
					{@const tab = views.get(tabId)}
					<div
						class="{baseClass}__tab-drop-hint {baseClass}__tab-drop-hint--{index}{hoverData?.target
							.tabIndex === index
							? ` ${baseClass}__tab-drop-hint--hover`
							: ''}"
						aria-hidden="true"
					></div>
					{#if isDragging}
						<div
							class="{baseClass}__tab-drop-zone {baseClass}__tab-drop-zone--{index}"
							aria-hidden="true"
							ondragenter={(event) => handleDragOver(event, { tabIndex: index })}
							ondragover={(event) => handleDragOver(event, { tabIndex: index })}
							ondragleave={handleDragLeave}
						></div>
					{/if}
					{@const isActive = index === config.activeTabIndex}
					<!-- Not focusable itself: a press focuses the tab list around it, whose keys select tabs. -->
					<!-- svelte-ignore a11y_interactive_supports_focus, a11y_click_events_have_key_events -->
					<div
						role="tab"
						id={tabElementId(index)}
						class="{baseClass}__tab{isActive ? ` ${baseClass}__tab--active` : ''}"
						aria-selected={isActive}
						aria-controls={isActive ? panelId : undefined}
						draggable={!disableDrag}
						ondragstart={(event) => startTabDrag(event, tabId)}
						onclick={() => (config.activeTabIndex = index)}
					>
						<span class="{baseClass}__tab-title">{tab?.title}</span>
						<div class="{baseClass}__tab-controls">
							{#each tab?.tabControls ?? [] as control (control)}
								<span class="{baseClass}__tab-control">
									{@render control(tabId)}
								</span>
							{/each}
						</div>
					</div>
				{/each}
				<div
					class="{baseClass}__tab-drop-hint {baseClass}__tab-drop-hint--{config.tabs
						.length} {baseClass}__tab-drop-hint--end{hoverData?.target.tabIndex ===
					config.tabs.length
						? ` ${baseClass}__tab-drop-hint--hover`
						: ''}"
					aria-hidden="true"
				></div>
				{#if isDragging}
					<div
						class="{baseClass}__tab-drop-zone {baseClass}__tab-drop-zone--{config.tabs
							.length} {baseClass}__tab-drop-zone--end"
						aria-hidden="true"
						ondragenter={(event) => handleDragOver(event, { tabIndex: config.tabs.length })}
						ondragover={(event) => handleDragOver(event, { tabIndex: config.tabs.length })}
						ondragleave={handleDragLeave}
					></div>
				{/if}
			</div>

			<div class="{baseClass}__controls">
				{#each controls as control (control)}
					<div class="{baseClass}__control">
						{@render control(config.tabs[config.activeTabIndex]!)}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="{baseClass}__body">
		<div
			class="{baseClass}__content"
			role={hasTabPanel ? 'tabpanel' : undefined}
			id={hasTabPanel ? panelId : undefined}
			aria-labelledby={hasTabPanel ? tabElementId(config.activeTabIndex) : undefined}
		>
			{@render views.get(activeTab!)?.snippet()}
		</div>
	</div>

	{#if isDragging}
		<div class="{baseClass}__drop-zones">
			{#each ['top', 'right', 'bottom', 'left'] as side (side)}
				<div
					class="{baseClass}__drop-zone {baseClass}__drop-zone--{side}"
					role="region"
					ondragenter={(event) => handleDragOver(event, { side: side as DropSide })}
					ondragover={(event) => handleDragOver(event, { side: side as DropSide })}
					ondragleave={handleDragLeave}
				></div>
			{/each}
		</div>
		{#if hoverData?.target.side}
			<div class="{baseClass}__drop-hint {baseClass}__drop-hint--{hoverData.target.side}"></div>
		{/if}
	{/if}
</section>
