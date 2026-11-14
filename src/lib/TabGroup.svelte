<!-- @component
A tab group: its tab bar (the tab list, each tab's controls and the group's shared controls) and
the active tab's view. The tab list takes the focus and runs the tab-group keyboard controls; tabs
drag out with HTML5 drag and drop, and while a tab is dragged the group shows drop zones (between
its tabs, and on its four sides to split it) and reports the one under the pointer to the layout.
Internal to HorizonLayout, rendered by LayoutNode for a docked group and by FloatingGroup.
-->
<script lang="ts">
	import type { Id, KeyboardControl, LayoutTranslations, TabGroupConfig, View } from './types.ts';
	import { onDestroy, tick, type Snippet } from 'svelte';
	import { findControl } from './internal-utils.ts';
	import type { SvelteMap } from 'svelte/reactivity';
	import type { DropSide, DropTarget } from './internal-types.ts';

	let {
		config = $bindable(),
		views,
		translations,
		disableDrag,
		isDragging,
		onStartTabDrag,
		onHoverEnter,
		onHoverExit,
		canDrop,
		hideTabBar,
		controls,
		keyboardControls,
		baseClass,
		onMoveStart,
		registerTabList
	}: {
		config: TabGroupConfig;
		views: SvelteMap<Id, View>;
		translations: LayoutTranslations;
		disableDrag: boolean;
		isDragging: boolean;
		onStartTabDrag: (event: DragEvent, tabGroup: TabGroupConfig, tabId: Id) => void;
		onHoverEnter: (tabGroup: TabGroupConfig, target: DropTarget) => void;
		onHoverExit: (tabGroup: TabGroupConfig) => void;
		canDrop: (tabGroup: TabGroupConfig, target: DropTarget) => boolean;
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

	// The tab list element, which takes the focus for the group.
	let tabListElement: HTMLElement | null = null;
	// Whether the tab list's focus reveals the active tab; not for a drag's.
	let isRevealOnFocus = true;

	function handleTabBarPointerDown(event: PointerEvent) {
		if (!onMoveStart || !(event.target instanceof Element)) return;
		const base = CSS.escape(baseClass);
		if (event.target.closest(`.${base}__tab, .${base}__controls`)) return;
		onMoveStart(event);
	}

	// A press on the tabs, but not on a tab's controls, focuses the tab list, whose keys select
	// tabs, as a press inside a focusable tab list would.
	function handleTabsClick(event: MouseEvent) {
		if (
			event.target instanceof Element &&
			event.target.closest(`.${CSS.escape(baseClass)}__tab-controls`)
		) {
			return;
		}
		tabListElement?.focus({ preventScroll: true });
	}

	function handleKeyDown(event: KeyboardEvent) {
		const control = findControl(keyboardControls, event);
		if (!control) return;
		event.preventDefault();
		event.stopPropagation();
		control.action(config, event);
		void tick().then(revealActiveTab);
	}

	// Scrolls the strip, when its tabs overflow, so the active tab shows: the focus ring is drawn
	// on it. A tab wider than the strip shows from its left edge, where its title is. Run when the
	// tab list takes the focus (a tab moved here, Tab, a press) and after its keys. The active tab
	// is found from the state, which a press has already changed when the focus comes, before the
	// DOM shows it. The strip alone scrolls: scrollIntoView would also scroll a pane shorter than
	// its tab bar; boxes are measured after transforms, scrollLeft before them.
	function revealActiveTab() {
		// After a key that took this group away, the component is gone: its props can't be read. A
		// connected element's root is a document or a shadow root, which getElementById needs.
		if (!tabListElement?.isConnected) return;
		const strip = tabListElement.parentElement;
		// Found in the layout's own tree, which a shadow root may hold.
		const root = tabListElement.getRootNode() as Document | ShadowRoot;
		const pill = root.getElementById(tabElementId(config.activeTabIndex))?.parentElement;
		if (!strip || !pill || pill.parentElement !== strip) return;
		const stripBox = strip.getBoundingClientRect();
		const pillBox = pill.getBoundingClientRect();
		const scale = strip.offsetWidth > 0 ? stripBox.width / strip.offsetWidth : 1;
		if (pillBox.left < stripBox.left || pillBox.width > stripBox.width) {
			strip.scrollLeft -= (stripBox.left - pillBox.left) / scale;
		} else if (pillBox.right > stripBox.right) {
			strip.scrollLeft += (pillBox.right - stripBox.right) / scale;
		}
	}

	// The layout sets the drag image and the allowed effect. A press that becomes a drag makes no
	// click, so the drag focuses the tab list, as a click would: a drag that ends before it takes
	// the tab out, with no drop to move the focus, leaves the keys to the tabs (in a floating
	// group, not to its frame).
	function startTabDrag(event: DragEvent, tabId: Id) {
		event.stopPropagation();
		// Without revealing the active tab: scrolling the strip would move the dragged tab under
		// the pointer as the drag starts. The focus event fires within focus().
		isRevealOnFocus = false;
		try {
			tabListElement?.focus({ preventScroll: true });
		} finally {
			isRevealOnFocus = true;
		}
		onStartTabDrag(event, config, tabId);
	}

	// The drop target under the pointer, shown as a drop hint. Drag events alone keep it right: the
	// zone under the pointer gets a dragover every few hundred milliseconds at most, and the drag
	// ends on it with a dragleave (cancelled) or a drop.
	let hoverTarget = $state<DropTarget | null>(null);
	// The config this group last reported as hovered, so the exit is reported for that object even
	// once the config prop has changed.
	let reportedConfig: TabGroupConfig | null = null;
	let shownHover = $derived(isDragging ? hoverTarget : null);

	function handleHoverExit() {
		hoverTarget = null;
		if (!reportedConfig) return;
		const reported = reportedConfig;
		reportedConfig = null;
		onHoverExit(reported);
	}

	// Reported on every dragover, not only when the target changes: the config, or whether the
	// target accepts the tab, may have changed since the last one, and the layout must drop the
	// tab into the group as it is now.
	// Returns whether the group takes the tab there.
	function handleHoverEnter(target: DropTarget): boolean {
		if (!isDragging || !canDrop(config, target)) {
			handleHoverExit();
			return false;
		}
		reportedConfig = config;
		onHoverEnter(config, target);
		if (hoverTarget?.side !== target.side || hoverTarget?.tabIndex !== target.tabIndex) {
			hoverTarget = target;
		}
		return true;
	}

	// Only a target that takes the tab cancels the event, which is what allows a drop there and
	// shows the move cursor.
	function handleDragOver(event: DragEvent, target: DropTarget) {
		event.stopPropagation();
		const accepted = handleHoverEnter(target);
		if (event.dataTransfer) event.dataTransfer.dropEffect = accepted ? 'move' : 'none';
		if (accepted) event.preventDefault();
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		handleHoverExit();
	}

	// Reports the target once more, as it is at the drop, then lets the drop bubble to the window,
	// where the layout moves the tab. The hover stays reported: the layout consumes it there.
	function handleDrop(event: DragEvent, target: DropTarget) {
		event.preventDefault();
		handleHoverEnter(target);
		hoverTarget = null;
		reportedConfig = null;
	}

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
			<!-- A press here focuses the tab list, whose keys stand for these pointer actions. -->
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div
				class="{baseClass}__tabs"
				style:touch-action={onMoveStart ? 'none' : undefined}
				onclick={handleTabsClick}
			>
				<!-- The tab list holds no element itself: it owns its tabs through aria-owns. A tab list may
				own tabs only (WAI-ARIA, and axe's aria-required-children), and a tab's children are
				presentational, so a tab's controls (its close button) can sit neither inside a tab nor
				inside the tab list's element without disappearing for assistive technologies or breaking
				the list. The tabs are laid out, each with its controls beside it in one pill, after this
				element in the strip that scrolls them, which a focusable element inside lets the keyboard
				reach; the tab list keeps the focus for the group and points at the active tab with
				aria-activedescendant, and the controls are each tab's group of buttons, reached with Tab.
				Out of sight, not out of reach: the focus ring is drawn on the active tab. The strip isn't
				its containing block (not positioned, transformed or otherwise made one): the block is
				outside what the strip scrolls, so focusing it never scrolls the strip. -->
				<div
					role="tablist"
					class="{baseClass}__tablist"
					style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);"
					aria-label={translations.tabList(views.get(activeTab ?? '')?.title ?? '')}
					aria-owns={config.tabs.map((_, index) => tabElementId(index)).join(' ')}
					tabindex={0}
					aria-activedescendant={activeTab === undefined
						? undefined
						: tabElementId(config.activeTabIndex)}
					onkeydown={handleKeyDown}
					onfocus={() => {
						if (isRevealOnFocus) revealActiveTab();
					}}
					{@attach (element) => {
						tabListElement = element;
						const unregister = registerTabList(config, element);
						return () => {
							unregister();
							if (tabListElement === element) tabListElement = null;
						};
					}}
				></div>
				{#each config.tabs as tabId, index (tabId)}
					{@const tab = views.get(tabId)}
					<div
						class="{baseClass}__tab-drop-hint {baseClass}__tab-drop-hint--{index}{shownHover?.tabIndex ===
						index
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
							ondrop={(event) => handleDrop(event, { tabIndex: index })}
						></div>
					{/if}
					{@const isActive = index === config.activeTabIndex}
					{@const tabControls = tab?.tabControls ?? []}
					<!-- The pill a tab is seen as, pressed and dragged with the pointer; the keyboard
					selects and moves tabs from the tab list. Presentational: Chrome would otherwise expose
					it as an unnamed group around the tab's controls. -->
					<div
						class="{baseClass}__tab{isActive ? ` ${baseClass}__tab--active` : ''}"
						role="presentation"
						draggable={!disableDrag}
						ondragstart={(event) => startTabDrag(event, tabId)}
						onclick={() => (config.activeTabIndex = index)}
					>
						<span
							role="tab"
							id={tabElementId(index)}
							class="{baseClass}__tab-title"
							aria-selected={isActive}
							aria-controls={isActive ? panelId : undefined}>{tab?.title}</span
						>
						<div
							class="{baseClass}__tab-controls"
							role={tabControls.length > 0 ? 'group' : undefined}
							aria-labelledby={tabControls.length > 0 ? tabElementId(index) : undefined}
						>
							{#each tabControls as control (control)}
								<span class="{baseClass}__tab-control">
									{@render control(tabId)}
								</span>
							{/each}
						</div>
					</div>
				{/each}
				<div
					class="{baseClass}__tab-drop-hint {baseClass}__tab-drop-hint--{config.tabs
						.length} {baseClass}__tab-drop-hint--end{shownHover?.tabIndex === config.tabs.length
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
						ondrop={(event) => handleDrop(event, { tabIndex: config.tabs.length })}
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
					aria-hidden="true"
					ondragenter={(event) => handleDragOver(event, { side: side as DropSide })}
					ondragover={(event) => handleDragOver(event, { side: side as DropSide })}
					ondragleave={handleDragLeave}
					ondrop={(event) => handleDrop(event, { side: side as DropSide })}
				></div>
			{/each}
		</div>
		{#if shownHover?.side}
			<div class="{baseClass}__drop-hint {baseClass}__drop-hint--{shownHover.side}"></div>
		{/if}
	{/if}
</section>
