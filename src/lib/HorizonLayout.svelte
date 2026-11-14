<script lang="ts">
	import { mount, onMount, tick, unmount, untrack, type Snippet } from 'svelte';
	import type {
		FloatingControlData,
		FloatingGroupConfig,
		Id,
		KeyboardControl,
		KeyboardControls,
		LayoutConfig,
		LayoutTranslations,
		NodeConfig,
		ParentEntry,
		SplitConfig,
		TabGroupConfig,
		Modifier,
		View
	} from './types.ts';
	import HorizonFloatingGroup from './FloatingGroup.svelte';
	import HorizonLayoutNode from './LayoutNode.svelte';
	import HorizonPopoutContent from './PopoutContent.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		buildNodeParentMap,
		simplifyTabGroup,
		areConfigsEquivalent,
		nodeConfigType,
		cloneConfig,
		validateConfig
	} from './utils.ts';
	import { DEFAULT_MIN_WIDTH_RATIO, DEFAULT_MIN_HEIGHT_RATIO } from './internal-utils.ts';
	import { dropTargetType, roundSplitPoint } from './internal-utils.ts';
	import type { DropTarget } from './internal-types.ts';
	import { reconcileConfig } from './reconcile.ts';
	import { moveFloatingGroup, resizeFloatingGroup } from './floating.ts';
	import { englishTranslations } from './translations.ts';

	interface Popout {
		window: Window;
		mountedContent: Record<string, unknown>;
		handleClose: () => void;
	}

	type Direction = 'left' | 'right' | 'up' | 'down';

	// State held for the duration of a drag operation.
	type DragData = {
		configBeforeDrag: LayoutConfig;
		tabId: Id;
		// The tab group and drop target currently being hovered over, or null.
		hover: { tabGroup: TabGroupConfig; target: DropTarget } | null;
	};

	let {
		config = $bindable(),
		views,
		translations = {},
		tabgroupControls = [],
		disableResizeSplits = false,
		disableDragAndDrop = false,
		showSplitRatio = false,
		minWidthRatio = DEFAULT_MIN_WIDTH_RATIO,
		minHeightRatio = DEFAULT_MIN_HEIGHT_RATIO,
		maxDepth = 6,
		hideTabBar = false,
		keyboardControls = {},
		formatRatio = (ratio: number) => `${(ratio * 100).toFixed(2)}%`,
		formatRatioForAria = (ratio: number) => Number((ratio * 100).toFixed(2)),
		onPopoutClose,
		onPopoutBlocked,
		baseClass = 'horizon-layout',
		skipValidation = false
	}: {
		/** The layout configuration. Bind this to keep it in sync with user interactions. */
		config: LayoutConfig;
		/** Map from view Id to its View descriptor. */
		views: SvelteMap<Id, View>;
		/**
		 * The text the layout writes itself (its accessible names), in the app's
		 * language. Every key left out, or the whole prop, falls back to `englishTranslations`; an
		 * app that translates its interface passes all of them.
		 */
		translations?: Partial<LayoutTranslations>;
		/** Snippets rendered in every tab-group's toolbar (e.g. a maximise button). */
		tabgroupControls?: Snippet<[Id]>[];
		/** Prevent the user from dragging split dividers. */
		disableResizeSplits?: boolean;
		/** Prevent drag-and-drop tab rearrangement. */
		disableDragAndDrop?: boolean;
		/** Show the current split ratio as a floating label while resizing. */
		showSplitRatio?: boolean;
		/** Minimum allowed width as a fraction of the split container. */
		minWidthRatio?: number;
		/** Minimum allowed height as a fraction of the split container. */
		minHeightRatio?: number;
		/** Maximum nesting depth for splits (prevents infinite subdivision). */
		maxDepth?: number;
		/** Hide the tab bar entirely (useful when every group has exactly one tab). */
		hideTabBar?: boolean;
		/**
		 * Keyboard shortcuts for splits, tab groups and floating groups. Each category given replaces its built-in
		 * controls; a category left out keeps them.
		 */
		keyboardControls?: KeyboardControls;
		/** Format a split ratio as a display string. Default: "50.00%". */
		formatRatio?: (ratio: number) => string;
		/** Format a split ratio as a number for aria-valuenow. Default: 50.00. */
		formatRatioForAria?: (ratio: number) => number;
		/** Called when a popout window is closed by the user. */
		onPopoutClose?: (viewId: Id) => void;
		/**
		 * Called when the browser blocks a popout window after the fallback timeout.
		 * If not provided, the blocked tab is automatically moved into the main layout.
		 */
		onPopoutBlocked?: (id: Id) => void;
		/** Root CSS class applied to the layout element and used as a BEM prefix. */
		baseClass?: string;
		/**
		 * Skip config validation on every update. Set this when you have already
		 * validated the config yourself (e.g. with validateConfig) and want to avoid
		 * the redundant check.
		 */
		skipValidation?: boolean;
	} = $props();

	// Key by key, so a key passed as undefined falls back too.
	let fullTranslations: LayoutTranslations = $derived({
		resizePane: translations.resizePane ?? englishTranslations.resizePane,
		floatingPanel: translations.floatingPanel ?? englishTranslations.floatingPanel
	});

	const FLOATING_STEP = 10;
	const FLOATING_BIG_STEP = 50;

	// One control per arrow key with `modifier`, calling `act` with the step along that arrow.
	function arrowControls(
		modifier: Modifier | undefined,
		step: number,
		act: (data: FloatingControlData, dx: number, dy: number) => void
	): KeyboardControl<FloatingControlData>[] {
		const arrows: [string, number, number][] = [
			['ArrowLeft', -step, 0],
			['ArrowRight', step, 0],
			['ArrowUp', 0, -step],
			['ArrowDown', 0, step]
		];
		return arrows.map(([key, dx, dy]) => ({
			shortcuts: [{ modifier, key }],
			action: (data) => act(data, dx, dy)
		}));
	}

	// The built-in keyboard controls, used for each category `keyboardControls` leaves out.
	const defaultKeyboardControls: Required<KeyboardControls> = {
		splitControls: [
			// Escape deselects/Blurs the split resizer.
			{
				shortcuts: [{ key: 'Escape' }],
				action: (_, event) => (event.currentTarget as HTMLElement).blur()
			},
			// Arrow keys move the resizer by 1 % steps.
			{
				shortcuts: [{ key: 'ArrowLeft' }, { key: 'ArrowUp' }],
				action: (data) =>
					moveSplit(data.config, data.index, data.config.splitPoints[data.index]! - 0.01)
			},
			{
				shortcuts: [{ key: 'ArrowRight' }, { key: 'ArrowDown' }],
				action: (data) =>
					moveSplit(data.config, data.index, data.config.splitPoints[data.index]! + 0.01)
			},
			// Shift → 10 % steps.
			{
				shortcuts: [
					{ modifier: 'shift', key: 'ArrowLeft' },
					{ modifier: 'shift', key: 'ArrowUp' }
				],
				action: (data) =>
					moveSplit(data.config, data.index, data.config.splitPoints[data.index]! - 0.1)
			},
			{
				shortcuts: [
					{ modifier: 'shift', key: 'ArrowRight' },
					{ modifier: 'shift', key: 'ArrowDown' }
				],
				action: (data) =>
					moveSplit(data.config, data.index, data.config.splitPoints[data.index]! + 0.1)
			},
			// Ctrl → 0.1 % steps.
			{
				shortcuts: [
					{ modifier: 'ctrl', key: 'ArrowLeft' },
					{ modifier: 'ctrl', key: 'ArrowUp' }
				],
				action: (data) =>
					moveSplit(data.config, data.index, data.config.splitPoints[data.index]! - 0.001)
			},
			{
				shortcuts: [
					{ modifier: 'ctrl', key: 'ArrowRight' },
					{ modifier: 'ctrl', key: 'ArrowDown' }
				],
				action: (data) =>
					moveSplit(data.config, data.index, data.config.splitPoints[data.index]! + 0.001)
			},
			// Alt → 0.01 % steps.
			{
				shortcuts: [
					{ modifier: 'alt', key: 'ArrowLeft' },
					{ modifier: 'alt', key: 'ArrowUp' }
				],
				action: (data) =>
					moveSplit(data.config, data.index, data.config.splitPoints[data.index]! - 0.0001)
			},
			{
				shortcuts: [
					{ modifier: 'alt', key: 'ArrowRight' },
					{ modifier: 'alt', key: 'ArrowDown' }
				],
				action: (data) =>
					moveSplit(data.config, data.index, data.config.splitPoints[data.index]! + 0.0001)
			},
			// Home -> snap the resizer to the minimum valid position.
			{
				shortcuts: [{ key: 'Home' }],
				action: (data) => moveSplit(data.config, data.index, 0)
			},
			// End -> snap the resizer to the maximum valid position.
			{
				shortcuts: [{ key: 'End' }],
				action: (data) => moveSplit(data.config, data.index, 1)
			}
		],
		tabGroupControls: [
			// Escape Unselects/Blurs the tab group.
			{
				shortcuts: [{ key: 'Escape' }],
				action: (_, event) => (event.currentTarget as HTMLElement).blur()
			},
			// Arrow keys cycle the active tab.
			{
				shortcuts: [{ key: 'ArrowRight' }, { key: 'ArrowDown' }],
				action: (tg) => selectTab(tg, (tg.activeTabIndex + 1) % tg.tabs.length)
			},
			{
				shortcuts: [{ key: 'ArrowLeft' }, { key: 'ArrowUp' }],
				action: (tg) => selectTab(tg, (tg.activeTabIndex + tg.tabs.length - 1) % tg.tabs.length)
			},
			// Home/End -> select the first/last tab.
			{
				shortcuts: [{ key: 'Home' }],
				action: (tg) => selectTab(tg, 0)
			},
			{
				shortcuts: [{ key: 'End' }],
				action: (tg) => selectTab(tg, tg.tabs.length - 1)
			},
			// Shift + Arrow reorders tabs within the group.
			{
				shortcuts: [
					{ modifier: 'shift', key: 'ArrowRight' },
					{ modifier: 'shift', key: 'ArrowDown' }
				],
				action: (tg) => moveTabToIndex(tg, (tg.activeTabIndex + 1) % tg.tabs.length)
			},
			{
				shortcuts: [
					{ modifier: 'shift', key: 'ArrowLeft' },
					{ modifier: 'shift', key: 'ArrowUp' }
				],
				action: (tg) =>
					moveTabToIndex(tg, (tg.activeTabIndex + tg.tabs.length - 1) % tg.tabs.length)
			},
			// Shift + Home/End moves the active tab to the start/end of the group.
			{
				shortcuts: [{ modifier: 'shift', key: 'Home' }],
				action: (tg) => moveTabToIndex(tg, 0)
			},
			{
				shortcuts: [{ modifier: 'shift', key: 'End' }],
				action: (tg) => moveTabToIndex(tg, tg.tabs.length - 1)
			},
			// Ctrl + Arrow moves the active tab to the nearest group in that direction.
			{
				shortcuts: [{ modifier: 'ctrl', key: 'ArrowRight' }],
				action: (tg) => moveActiveTabToClosestTabGroup(tg, 'right')
			},
			{
				shortcuts: [{ modifier: 'ctrl', key: 'ArrowDown' }],
				action: (tg) => moveActiveTabToClosestTabGroup(tg, 'down')
			},
			{
				shortcuts: [{ modifier: 'ctrl', key: 'ArrowLeft' }],
				action: (tg) => moveActiveTabToClosestTabGroup(tg, 'left')
			},
			{
				shortcuts: [{ modifier: 'ctrl', key: 'ArrowUp' }],
				action: (tg) => moveActiveTabToClosestTabGroup(tg, 'up')
			},
			// Ctrl + Home/End moves the active tab to the first/last group in the layout.
			{
				shortcuts: [{ modifier: 'ctrl', key: 'Home' }],
				action: (tg) => moveActiveTabToTabGroup(tg, firstTabGroup())
			},
			{
				shortcuts: [{ modifier: 'ctrl', key: 'End' }],
				action: (tg) => moveActiveTabToTabGroup(tg, lastTabGroup())
			},
			// Alt + Arrow splits the active tab out into a new pane in that direction.
			{
				shortcuts: [{ modifier: 'alt', key: 'ArrowRight' }],
				action: (tg) => splitTabGroup(tg, 'right')
			},
			{
				shortcuts: [{ modifier: 'alt', key: 'ArrowDown' }],
				action: (tg) => splitTabGroup(tg, 'down')
			},
			{
				shortcuts: [{ modifier: 'alt', key: 'ArrowLeft' }],
				action: (tg) => splitTabGroup(tg, 'left')
			},
			{
				shortcuts: [{ modifier: 'alt', key: 'ArrowUp' }],
				action: (tg) => splitTabGroup(tg, 'up')
			}
		],
		floatingControls: [
			// Escape blurs the floating group's frame.
			{
				shortcuts: [{ key: 'Escape' }],
				action: (_, event) => (event.currentTarget as HTMLElement).blur()
			},
			// Arrow keys move the group by 10 px, 50 px with Shift.
			...arrowControls(undefined, FLOATING_STEP, (data, dx, dy) =>
				moveFloatingGroup(data.config, dx, dy, data.bounds)
			),
			...arrowControls('shift', FLOATING_BIG_STEP, (data, dx, dy) =>
				moveFloatingGroup(data.config, dx, dy, data.bounds)
			),
			// Alt + Arrow resizes it (right and down grow it), by 50 px with Shift too.
			...arrowControls('alt', FLOATING_STEP, (data, dx, dy) =>
				resizeFloatingGroup(data.config, dx, dy, data.bounds)
			),
			...arrowControls('alt+shift', FLOATING_BIG_STEP, (data, dx, dy) =>
				resizeFloatingGroup(data.config, dx, dy, data.bounds)
			)
		]
	};

	let controls: Required<KeyboardControls> = $derived({
		splitControls: keyboardControls.splitControls ?? defaultKeyboardControls.splitControls,
		tabGroupControls: keyboardControls.tabGroupControls ?? defaultKeyboardControls.tabGroupControls,
		floatingControls: keyboardControls.floatingControls ?? defaultKeyboardControls.floatingControls
	});

	// The size of the layout's box, which floating groups are kept inside; zero until measured.
	let layoutWidth = $state(0);
	let layoutHeight = $state(0);

	// The layout operates on a validated internal copy so that invalid external
	// configs are caught at the boundary without corrupting the running state.
	// This also permits the drag-and-drop logic to make temporary modifications (hiding the currently dragged tab)
	// without affecting the external config until the drag is complete.
	let internalConfig = $state<LayoutConfig | null>(null);
	let dragData = $state<DragData | null>(null);

	// Precomputed map from every NodeConfig to its parent split + child index.
	// Rebuilt whenever internalConfig changes.
	//
	// This isn't the most performant approach, but
	// it has the advantage of being simpler than
	// incrementally maintaining the map during tree mutations
	// or using a cache with complex invalidation logic.
	let nodeParentMap: SvelteMap<NodeConfig, ParentEntry> = $derived(
		internalConfig?.root ? buildNodeParentMap(internalConfig.root) : new SvelteMap()
	);

	// Propagate external config changes → internalConfig.
	//
	// External config is always authoritative.
	// If it changes during a drag operation, the drag is cancelled
	// and the new config is applied immediately.
	$effect(() => {
		// Validation-time inputs are read on every run
		// so that changing them revalidates the config.
		void minWidthRatio;
		void minHeightRatio;
		void skipValidation;
		void views;

		const external = $state.snapshot(config);
		const internal = untrack(() => internalConfig && $state.snapshot(internalConfig));

		if (internal && areConfigsEquivalent(internal, external)) {
			return;
		}

		if (untrack(() => dragData)) {
			dragData = null;
		}

		if (!isValidConfig(external)) {
			internalConfig = null;
			return;
		}
		// Applied in place, so the panels still in the same split stay mounted.
		untrack(() => {
			if (internalConfig) reconcileConfig(internalConfig, external);
			else internalConfig = cloneConfig(external);
		});
	});

	// Propagate internalConfig changes → external config binding.
	// Skipped while a drag is in progress to avoid propagating temporary intermediate states.
	$effect(() => {
		if (dragData || !internalConfig) return;

		const external = untrack(() => $state.snapshot(config));
		if (!areConfigsEquivalent(internalConfig, external)) {
			config = cloneConfig(internalConfig);
		}
	});

	// Whether an external LayoutConfig can be shown; logs the first violated constraint when not.
	function isValidConfig(input: LayoutConfig): boolean {
		if (!skipValidation) {
			if (minWidthRatio < 0 || minWidthRatio > 0.5) {
				console.error('HorizonLayout: minWidthRatio must be between 0 and 0.5');
				return false;
			}
			if (minHeightRatio < 0 || minHeightRatio > 0.5) {
				console.error('HorizonLayout: minHeightRatio must be between 0 and 0.5');
				return false;
			}
			if (maxDepth < 1) {
				console.error('HorizonLayout: maxDepth must be at least 1');
				return false;
			}

			try {
				validateConfig(input, views, { minWidthRatio, minHeightRatio });
			} catch (e) {
				console.error(`HorizonLayout: ${(e as Error).message}`);
				return false;
			}
		}

		return true;
	}

	function moveSplit(split: SplitConfig, index: number, ratio: number) {
		const minRatio = split.direction === 'horizontal' ? minWidthRatio : minHeightRatio;
		const min = (split.splitPoints[index - 1] ?? 0) + minRatio;
		const max = (split.splitPoints[index + 1] ?? 1) - minRatio;
		const clamped = roundSplitPoint(Math.min(Math.max(ratio, min), max));
		if (clamped !== split.splitPoints[index]) split.splitPoints[index] = clamped;
	}

	function selectTab(tabGroup: TabGroupConfig, index: number) {
		if (index !== tabGroup.activeTabIndex) tabGroup.activeTabIndex = index;
	}

	// Move the active tab to targetIndex, keeping focus on the moved tab.
	function moveTabToIndex(tabGroup: TabGroupConfig, targetIndex: number) {
		if (targetIndex === tabGroup.activeTabIndex) return;
		const [tab] = tabGroup.tabs.splice(tabGroup.activeTabIndex, 1);
		if (!tab) return;
		tabGroup.tabs.splice(targetIndex, 0, tab);
		tabGroup.activeTabIndex = targetIndex;
	}

	function isFloating(tabGroup: TabGroupConfig): tabGroup is FloatingGroupConfig {
		return internalConfig?.floating?.includes(tabGroup as FloatingGroupConfig) ?? false;
	}

	// The first and the last tab group of the docked layout, or undefined when nothing is docked.
	function firstTabGroup(node = internalConfig?.root): TabGroupConfig | undefined {
		if (!node || nodeConfigType(node) === 'tabGroup') return node as TabGroupConfig | undefined;
		return firstTabGroup((node as SplitConfig).views[0]!);
	}

	function lastTabGroup(node = internalConfig?.root): TabGroupConfig | undefined {
		if (!node || nodeConfigType(node) === 'tabGroup') return node as TabGroupConfig | undefined;
		const vs = (node as SplitConfig).views;
		return lastTabGroup(vs[vs.length - 1]!);
	}

	// The tab group on the `direction` side of `node`, for docking a floating tab at that side.
	function outerEdgeTabGroup(node: NodeConfig, direction: Direction): TabGroupConfig {
		if (nodeConfigType(node) === 'tabGroup') return node as TabGroupConfig;
		const split = node as SplitConfig;
		const takesLast = split.direction === axisOf(direction) && !isLeftOrUp(direction);
		return outerEdgeTabGroup(split.views[takesLast ? split.views.length - 1 : 0]!, direction);
	}

	function axisOf(direction: Direction): SplitConfig['direction'] {
		return direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
	}

	function isLeftOrUp(direction: Direction): boolean {
		return direction === 'left' || direction === 'up';
	}

	// Takes the active tab out of `source`, removing the group if that leaves it empty.
	function takeActiveTab(source: TabGroupConfig): Id {
		const tab = source.tabs[source.activeTabIndex]!;
		source.tabs.splice(source.activeTabIndex, 1);
		source.activeTabIndex = Math.max(Math.min(source.activeTabIndex, source.tabs.length - 1), 0);
		simplifyTabGroup(source, nodeParentMap, internalConfig!);
		return tab;
	}

	// Moves the active tab of `source` to the end of `destination`, or makes it the whole docked
	// layout when `destination` is undefined (nothing is docked); focus follows the tab.
	function moveActiveTabToTabGroup(
		source: TabGroupConfig,
		destination: TabGroupConfig | undefined
	) {
		if (source === destination) return;

		const sourceTab = takeActiveTab(source);

		if (destination) {
			destination.activeTabIndex = destination.tabs.length;
			destination.tabs.push(sourceTab);
			focusTabGroup(destination);
		} else {
			internalConfig!.root = { tabs: [sourceTab], activeTabIndex: 0 };
			focusTabGroup(internalConfig!.root);
		}
	}

	// Walk up the tree to find the nearest split on the target axis, then pick
	// the adjacent pane in the requested direction. A floating group's tab goes
	// to the docked group on that side of the layout.
	function moveActiveTabToClosestTabGroup(tabGroup: TabGroupConfig, direction: Direction) {
		if (isFloating(tabGroup)) {
			const root = internalConfig!.root;
			moveActiveTabToTabGroup(tabGroup, root && outerEdgeTabGroup(root, direction));
			return;
		}

		const directionAxis = axisOf(direction);
		const isDirectionLeftOrUp = isLeftOrUp(direction);

		const edgeTabGroup = (root: NodeConfig): TabGroupConfig => {
			if (nodeConfigType(root) === 'tabGroup') return root as TabGroupConfig;
			const split = root as SplitConfig;
			const index = isDirectionLeftOrUp ? split.views.length - 1 : 0;
			return edgeTabGroup(split.views[index]!);
		};

		const findClosestTabGroupAndMoveTab = (child: NodeConfig) => {
			const parentData = nodeParentMap.get(child);
			if (!parentData) return;

			if (parentData.parent.direction !== directionAxis) {
				return findClosestTabGroupAndMoveTab(parentData.parent);
			}

			const targetIndex = parentData.index + (isDirectionLeftOrUp ? -1 : 1);

			if (targetIndex < 0 || targetIndex >= parentData.parent.views.length) {
				return findClosestTabGroupAndMoveTab(parentData.parent);
			}

			moveActiveTabToTabGroup(tabGroup, edgeTabGroup(parentData.parent.views[targetIndex]!));
		};

		findClosestTabGroupAndMoveTab(tabGroup);
	}

	function paneMidpoint(parent: ParentEntry): number {
		return (
			((parent.parent.splitPoints[parent.index - 1] ?? 0) +
				(parent.parent.splitPoints[parent.index] ?? 1)) /
			2
		);
	}

	// How many tab groups deep the docked layout is at its deepest (a lone tab group is 1).
	function treeDepth(node: NodeConfig): number {
		if (nodeConfigType(node) === 'tabGroup') return 1;
		return 1 + Math.max(...(node as SplitConfig).views.map(treeDepth));
	}

	function canSplitTabGroup(tabGroup: TabGroupConfig, splitDirection: SplitConfig['direction']) {
		const parent = nodeParentMap.get(tabGroup);
		if (parent?.parent.direction === splitDirection) {
			return (
				((parent.parent.splitPoints[parent.index] ?? 1) -
					(parent.parent.splitPoints[parent.index - 1] ?? 0)) /
					2 >=
				(splitDirection === 'horizontal' ? minWidthRatio : minHeightRatio)
			);
		}

		const getNodeDepth = (node: NodeConfig, depth = 1): number => {
			const parent = nodeParentMap.get(node);
			if (!parent) return depth;
			return getNodeDepth(parent.parent, depth + 1);
		};

		return getNodeDepth(tabGroup) + 1 <= maxDepth;
	}

	// A floating group takes tabs into its tab bar only: it holds no splits.
	function canDrop(tabGroup: TabGroupConfig, target: DropTarget) {
		if (dropTargetType(target) === 'tab') return true;
		if (isFloating(tabGroup)) return false;
		return canSplitTabGroup(
			tabGroup,
			target.side === 'left' || target.side === 'right' ? 'horizontal' : 'vertical'
		);
	}

	// Splits the active tab out into a new pane on the `direction` side of its group; a floating
	// group's tab is docked as a new pane on that side of the whole layout instead. Focus follows
	// the tab.
	function splitTabGroup(tabGroup: TabGroupConfig, direction: Direction) {
		if (isFloating(tabGroup)) {
			dockAtEdge(tabGroup, direction);
			return;
		}
		if (tabGroup.tabs.length === 1) return;

		const tabToSplitOut = tabGroup.tabs[tabGroup.activeTabIndex]!;
		const oldActiveTabIndex = tabGroup.activeTabIndex;
		const splitDirection = axisOf(direction);
		const newTabGroup: TabGroupConfig = { tabs: [tabToSplitOut], activeTabIndex: 0 };
		const parent = nodeParentMap.get(tabGroup);
		const isCurrentTabFirst = isLeftOrUp(direction);
		const createsNestedSplit = !parent || parent.parent.direction !== splitDirection;

		if (!canSplitTabGroup(tabGroup, splitDirection)) return;

		tabGroup.tabs = tabGroup.tabs.filter((_, index) => index !== oldActiveTabIndex) as [
			Id,
			...Id[]
		];
		tabGroup.activeTabIndex = Math.min(oldActiveTabIndex, tabGroup.tabs.length - 1);

		if (createsNestedSplit) {
			const split: SplitConfig = {
				direction: splitDirection,
				views: isCurrentTabFirst ? [newTabGroup, tabGroup] : [tabGroup, newTabGroup],
				splitPoints: [0.5]
			};
			const tabgroupParent = nodeParentMap.get(tabGroup);
			if (tabgroupParent) {
				tabgroupParent.parent.views[tabgroupParent.index] = split;
				const inserted = tabgroupParent.parent.views[tabgroupParent.index] as SplitConfig;
				focusTabGroup(inserted.views[isCurrentTabFirst ? 0 : 1] as TabGroupConfig);
			} else {
				internalConfig!.root = split;
				const inserted = internalConfig!.root as SplitConfig;
				focusTabGroup(inserted.views[isCurrentTabFirst ? 0 : 1] as TabGroupConfig);
			}
		} else {
			// Insert into the existing split rather than creating a new nested one
			const insertIndex = parent.index + (isCurrentTabFirst ? 0 : 1);
			parent.parent.views.splice(insertIndex, 0, newTabGroup);
			// Split the target pane in half
			parent.parent.splitPoints.splice(parent.index, 0, paneMidpoint(parent));
			focusTabGroup(parent.parent.views[insertIndex] as TabGroupConfig);
		}
	}

	// Docks the active tab of a floating group as a new pane on the `direction` side of the docked
	// layout: into the root split when it runs along that axis (halving its edge pane), otherwise
	// around the whole layout. Does nothing when the minimum sizes or maxDepth leave no room.
	function dockAtEdge(source: FloatingGroupConfig, direction: Direction) {
		const config = internalConfig!;
		const root = config.root;
		const splitDirection = axisOf(direction);
		const isFirst = isLeftOrUp(direction);

		if (!root) {
			moveActiveTabToTabGroup(source, undefined);
			return;
		}

		if (nodeConfigType(root) === 'split' && (root as SplitConfig).direction === splitDirection) {
			const split = root as SplitConfig;
			const edge = { parent: split, index: isFirst ? 0 : split.views.length - 1 };
			const share = (split.splitPoints[edge.index] ?? 1) - (split.splitPoints[edge.index - 1] ?? 0);
			const minRatio = splitDirection === 'horizontal' ? minWidthRatio : minHeightRatio;
			if (share / 2 < minRatio) return;
			const midpoint = paneMidpoint(edge);
			const group: TabGroupConfig = { tabs: [takeActiveTab(source)], activeTabIndex: 0 };
			const insertIndex = isFirst ? 0 : split.views.length;
			split.views.splice(insertIndex, 0, group);
			split.splitPoints.splice(edge.index, 0, midpoint);
			focusTabGroup(split.views[insertIndex] as TabGroupConfig);
			return;
		}

		if (treeDepth(root) + 1 > maxDepth) return;
		const group: TabGroupConfig = { tabs: [takeActiveTab(source)], activeTabIndex: 0 };
		config.root = {
			direction: splitDirection,
			views: isFirst ? [group, root] : [root, group],
			splitPoints: [0.5]
		};
		focusTabGroup((config.root as SplitConfig).views[isFirst ? 0 : 1] as TabGroupConfig);
	}

	// The tab list element of every rendered tab group, to move focus to a group.
	const tabLists = new Map<TabGroupConfig, HTMLElement>();

	function registerTabList(config: TabGroupConfig, element: HTMLElement) {
		tabLists.set(config, element);
		return () => {
			if (tabLists.get(config) === element) tabLists.delete(config);
		};
	}

	// Focuses the tab list of `group` once the change that put a tab there is rendered.
	function focusTabGroup(group: TabGroupConfig) {
		void tick().then(() => tabLists.get(group)?.focus());
	}

	// Floating groups are rendered in the order they first appeared, and stacked by their place in
	// `floating`: raising one changes z-indexes only, and never moves an element, which would
	// reload an iframe inside it and drop the focus in it.
	const floatingFirstSeen = new WeakMap<FloatingGroupConfig, number>();
	let floatingSeenCount = 0;
	let floatingRenderOrder = $derived.by(() => {
		const floating = internalConfig?.floating ?? [];
		for (const group of floating) {
			if (!floatingFirstSeen.has(group)) floatingFirstSeen.set(group, floatingSeenCount++);
		}
		return [...floating].sort((a, b) => floatingFirstSeen.get(a)! - floatingFirstSeen.get(b)!);
	});

	// Puts a floating group on top of the others.
	function raiseFloatingGroup(group: FloatingGroupConfig) {
		const floating = internalConfig?.floating;
		const index = floating?.indexOf(group) ?? -1;
		if (!floating || index === -1 || index === floating.length - 1) return;
		floating.splice(index, 1);
		floating.push(group);
	}

	function onHoverEnter(tabGroup: TabGroupConfig, target: DropTarget) {
		if (dragData) dragData.hover = { tabGroup, target };
	}

	function onHoverExit(tabGroup: TabGroupConfig) {
		if (dragData?.hover?.tabGroup === tabGroup) dragData.hover = null;
	}

	function onStartTabDrag(event: DragEvent, tabGroup: TabGroupConfig, tabId: Id) {
		if (dragData) return;

		const tabIndex = tabGroup.tabs.indexOf(tabId);
		if (tabIndex === -1) return;
		const activeTabIndex = tabGroup.activeTabIndex;

		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			if (event.currentTarget instanceof HTMLElement) {
				event.dataTransfer.setDragImage(
					event.currentTarget,
					event.currentTarget.offsetWidth / 2,
					event.currentTarget.offsetHeight / 2
				);
			}
		}

		event.target!.addEventListener('dragend', onDrop, { once: true });
		window.addEventListener('dragend', onDrop, { once: true });
		window.addEventListener('drop', onDrop, { once: true });

		requestAnimationFrame(() => {
			dragData = {
				configBeforeDrag: cloneConfig(internalConfig!),
				tabId,
				hover: null
			};
			tabGroup.tabs.splice(tabIndex, 1);
			if (tabGroup.tabs.length > 0) {
				if (activeTabIndex === tabIndex) {
					tabGroup.activeTabIndex = Math.min(tabIndex, tabGroup.tabs.length - 1);
				} else if (activeTabIndex > tabIndex) {
					tabGroup.activeTabIndex = activeTabIndex - 1;
				} else {
					tabGroup.activeTabIndex = activeTabIndex;
				}
			}
			simplifyTabGroup(tabGroup, nodeParentMap, internalConfig!);
			if (dragData) dragData.hover = null;
		});
	}

	function onDrop() {
		if (!dragData) return;

		const { tabId, configBeforeDrag, hover } = dragData;
		dragData = null;

		if (hover) {
			const { tabGroup, target } = hover;

			if (target.tabIndex !== undefined) {
				let insertIndex = Math.min(Math.max(target.tabIndex, 0), tabGroup.tabs.length);
				tabGroup.tabs.splice(insertIndex, 0, tabId);
				tabGroup.activeTabIndex = insertIndex;
			} else {
				const { side } = target;
				const splitDirection = side === 'left' || side === 'right' ? 'horizontal' : 'vertical';
				const isAfter = side === 'right' || side === 'bottom';

				const parent = nodeParentMap.get(tabGroup);
				if (parent) {
					if (parent.parent.direction === splitDirection) {
						const insertIndex = parent.index + (isAfter ? 1 : 0);
						parent.parent.views.splice(insertIndex, 0, {
							tabs: [tabId],
							activeTabIndex: 0
						});
						// Split the target pane in half
						parent.parent.splitPoints.splice(parent.index, 0, paneMidpoint(parent));
					} else {
						const newSplit: SplitConfig = {
							direction: splitDirection,
							views: isAfter
								? [tabGroup, { tabs: [tabId], activeTabIndex: 0 }]
								: [{ tabs: [tabId], activeTabIndex: 0 }, tabGroup],
							splitPoints: [0.5]
						};
						parent.parent.views[parent.index] = newSplit;
					}
				} else {
					internalConfig!.root = {
						direction: splitDirection,
						views: isAfter
							? [tabGroup, { tabs: [tabId], activeTabIndex: 0 }]
							: [{ tabs: [tabId], activeTabIndex: 0 }, tabGroup],
						splitPoints: [0.5]
					};
				}
			}
		} else {
			reconcileConfig(internalConfig!, configBeforeDrag);
		}
	}

	const POPOUT_BLOCKED_TIMEOUT_MS = 500;

	const popouts = new SvelteMap<Id, Popout>();
	// Maps view id → timestamp (ms) when the popout was first blocked by the browser.
	const pendingPopouts = new SvelteMap<Id, number>();
	let retryRafId: ReturnType<typeof requestAnimationFrame> | null = null;

	$effect(() => {
		if (!internalConfig) return;
		const wanted = new Set(internalConfig.popouts ?? []);

		// Close any popouts that are no longer in the config.
		for (const id of popouts.keys()) {
			if (!wanted.has(id)) cleanupPopout(id, true);
		}

		// Drop pending entries for ids that are no longer wanted.
		for (const id of pendingPopouts.keys()) {
			if (!wanted.has(id)) pendingPopouts.delete(id);
		}

		// Open any new popouts.
		for (const id of wanted) {
			const view = views.get(id);
			if (view) openPopout(id, view);
		}

		if (pendingPopouts.size > 0 && retryRafId === null) {
			retryRafId = requestAnimationFrame(retryPendingPopouts);
		}
	});

	// Close all popout windows when the base window closes or the component is unmounted.
	function closeAllPopouts() {
		for (const id of popouts.keys()) {
			cleanupPopout(id, true);
		}
	}

	function retryPendingPopouts() {
		const now = Date.now();
		for (const [id, since] of pendingPopouts.entries()) {
			if (now - since >= POPOUT_BLOCKED_TIMEOUT_MS) {
				pendingPopouts.delete(id);
				handleBlockedPopout(id);
			} else {
				pendingPopouts.delete(id);
				const view = views.get(id);
				if (view) openPopout(id, view, since);
			}
		}
		retryRafId = pendingPopouts.size > 0 ? requestAnimationFrame(retryPendingPopouts) : null;
	}

	function handleBlockedPopout(id: Id) {
		if (!internalConfig) return;

		if (internalConfig.popouts) {
			const remaining = internalConfig.popouts.filter((p) => p !== id);
			internalConfig.popouts = remaining.length ? remaining : undefined;
		}

		if (onPopoutBlocked) {
			onPopoutBlocked(id);
		} else {
			if (internalConfig.root) {
				const target = lastTabGroup()!;
				target.tabs.push(id);
				target.activeTabIndex = target.tabs.length - 1;
			} else {
				internalConfig.root = { tabs: [id], activeTabIndex: 0 };
			}
		}
	}

	onMount(() => {
		window.addEventListener('beforeunload', closeAllPopouts);
		window.addEventListener('pagehide', closeAllPopouts);
		return () => {
			window.removeEventListener('beforeunload', closeAllPopouts);
			window.removeEventListener('pagehide', closeAllPopouts);
			if (retryRafId !== null) cancelAnimationFrame(retryRafId);
			closeAllPopouts();
		};
	});

	function cleanupPopout(id: Id, closeWindow: boolean) {
		const popout = popouts.get(id);
		if (!popout) return;

		popouts.delete(id);
		popout.window.removeEventListener('pagehide', popout.handleClose);
		popout.window.removeEventListener('beforeunload', popout.handleClose);

		void unmount(popout.mountedContent);

		if (closeWindow && !popout.window.closed) {
			popout.window.close();
		}
	}

	function openPopout(id: Id, view: View, blockedSince?: number) {
		if (popouts.has(id) || pendingPopouts.has(id)) return;

		const removePopoutFromConfig = (id: Id) => {
			if (!internalConfig?.popouts) return;
			const remaining = internalConfig.popouts.filter((p) => p !== id);
			internalConfig.popouts = remaining.length ? remaining : undefined;
		};

		const popoutWindow = window.open('', '_blank');
		if (!popoutWindow) {
			pendingPopouts.set(id, blockedSince ?? Date.now());
			return;
		}

		// Mirror host-page styles so Svelte components render correctly in the new window.
		for (const node of document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
			'link[rel~="stylesheet"], style'
		)) {
			const clone = node.cloneNode(true);
			if (node instanceof HTMLLinkElement && clone instanceof HTMLLinkElement) {
				clone.href = node.href;
			}
			popoutWindow.document.head.appendChild(clone);
		}

		const mountedContent = mount(HorizonPopoutContent, {
			target: popoutWindow.document.body,
			props: { popout: popoutWindow, title: view.title, view, baseClass }
		});

		const handleClose = () => {
			if (!popouts.has(id)) return;
			cleanupPopout(id, false);
			removePopoutFromConfig(id);
			onPopoutClose?.(id);
		};

		popouts.set(id, { window: popoutWindow, mountedContent, handleClose });
		popoutWindow.addEventListener('pagehide', handleClose);
		popoutWindow.addEventListener('beforeunload', handleClose);
	}
</script>

<div
	class={baseClass}
	style:position="relative"
	bind:clientWidth={layoutWidth}
	bind:clientHeight={layoutHeight}
>
	{#if internalConfig}
		{#if internalConfig.maximizedView}
			{@const view = views.get(internalConfig.maximizedView)}
			<div class="{baseClass}__content {baseClass}__content--maximized" aria-label={view?.title}>
				{@render view?.snippet()}
			</div>
		{:else}
			{#if internalConfig.root}
				<!-- Its own stacking context, so the z-indexes inside it (tab bars, split handles,
				drop zones) stay under the floating groups, drawn after it. -->
				<div class="{baseClass}__content" style="isolation: isolate;">
					<HorizonLayoutNode
						bind:config={internalConfig.root}
						{views}
						translations={fullTranslations}
						{tabgroupControls}
						{disableResizeSplits}
						{disableDragAndDrop}
						isDragging={dragData !== null}
						{onStartTabDrag}
						{onHoverEnter}
						{onHoverExit}
						{canDrop}
						{showSplitRatio}
						{minWidthRatio}
						{minHeightRatio}
						{hideTabBar}
						keyboardControls={controls}
						{formatRatio}
						{formatRatioForAria}
						{baseClass}
						{registerTabList}
					></HorizonLayoutNode>
				</div>
			{/if}
			{#if internalConfig.floating}
				{@const floating = internalConfig.floating}
				<div
					class="{baseClass}__floating"
					style="position: absolute; inset: 0; pointer-events: none; isolation: isolate;"
				>
					{#each floatingRenderOrder as group (group)}
						{@const index = floating.indexOf(group)}
						<HorizonFloatingGroup
							bind:config={floating[index]!}
							bounds={{ width: layoutWidth, height: layoutHeight }}
							zIndex={index + 1}
							topZIndex={floating.length + 1}
							{views}
							translations={fullTranslations}
							{tabgroupControls}
							{disableDragAndDrop}
							isDragging={dragData !== null}
							{onStartTabDrag}
							{onHoverEnter}
							{onHoverExit}
							{canDrop}
							tabGroupControls={controls.tabGroupControls}
							floatingControls={controls.floatingControls}
							{baseClass}
							{registerTabList}
							onRaise={raiseFloatingGroup}
						/>
					{/each}
				</div>
			{/if}
		{/if}
	{/if}
</div>
