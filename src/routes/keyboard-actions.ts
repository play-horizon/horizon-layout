/**
 * The demo's own keyboard controls, built from the bindings edited in the sidebar
 * (`KeyboardControls.svelte`). They stand in for the library's built-in tab-group and split
 * controls once a binding differs from its default; floating groups keep their built-in controls.
 * The actions are shorter than the library's own: they show how an app writes its controls.
 * @module
 */
import type {
	Id,
	KeyboardControl,
	KeyboardControls,
	KeyboardShortcut,
	LayoutConfig,
	NodeConfig,
	SplitConfig,
	TabGroupConfig
} from '#lib/types.js';
import {
	buildNodeParentMap,
	findTabGroup,
	nodeConfigType,
	removeView,
	simplifyTabGroup
} from '#lib/utils.js';
import type { ActionId } from './KeyboardControls.svelte';
import { depthOf, firstTabGroup, lastTabGroup } from './layout-tree.js';

type Direction = 'left' | 'right' | 'up' | 'down';
type SplitData = { config: SplitConfig; index: number };

/** What the actions read from the main layout when they run: its live config and options. */
export interface DemoLayout {
	/** The config bound to the layout; actions on the whole tree change it in place. */
	readonly config: LayoutConfig;
	readonly minWidthRatio: number;
	readonly minHeightRatio: number;
	readonly maxDepth: number;
}

/** The shortcut of each action before the user edits it, matching the library's built-ins. */
export const defaultBindings: Readonly<Record<ActionId, KeyboardShortcut>> = {
	deselect: { key: 'Escape' },
	cycleNext: { key: 'ArrowRight' },
	cyclePrev: { key: 'ArrowLeft' },
	moveTabNext: { modifier: 'shift', key: 'ArrowRight' },
	moveTabPrev: { modifier: 'shift', key: 'ArrowLeft' },
	splitRight: { modifier: 'alt', key: 'ArrowRight' },
	splitLeft: { modifier: 'alt', key: 'ArrowLeft' },
	splitUp: { modifier: 'alt', key: 'ArrowUp' },
	splitDown: { modifier: 'alt', key: 'ArrowDown' },
	moveNextPane: { modifier: 'ctrl', key: 'ArrowRight' },
	movePrevPane: { modifier: 'ctrl', key: 'ArrowLeft' },
	resizeBigger: { key: 'ArrowRight' },
	resizeSmaller: { key: 'ArrowLeft' },
	resizeMin: { key: 'Home' },
	resizeMax: { key: 'End' }
};

/** Whether every binding is still its default, so the library's built-in controls apply. */
export function isDefaultBindings(bindings: Record<ActionId, KeyboardShortcut>): boolean {
	return (Object.keys(defaultBindings) as ActionId[]).every(
		(action) =>
			bindings[action].key === defaultBindings[action].key &&
			bindings[action].modifier === defaultBindings[action].modifier
	);
}

/**
 * The tab-group and split controls for `bindings`, acting on `layout`. The arrow-key actions
 * also answer to the arrow perpendicular to theirs (Down for Right, Up for Left), as the
 * built-ins do for vertical splits and tab lists.
 */
export function buildKeyboardControls(
	bindings: Record<ActionId, KeyboardShortcut>,
	layout: DemoLayout
): KeyboardControls {
	const tabGroupHandlers = tabGroupActions(layout);
	const splitHandlers = splitActions(layout);
	const tabGroup: KeyboardControl<TabGroupConfig>[] = [];
	const pushTab = (action: ActionId, extraKeys: string[] = []) => {
		const binding = bindings[action];
		const handler = tabGroupHandlers[action];
		if (!handler) return;
		tabGroup.push({
			shortcuts: [binding, ...extraKeys.map((key) => ({ modifier: binding.modifier, key }))],
			action: handler
		});
	};
	pushTab('deselect');
	pushTab('cycleNext', ['ArrowDown']);
	pushTab('cyclePrev', ['ArrowUp']);
	pushTab('moveTabNext', ['ArrowDown']);
	pushTab('moveTabPrev', ['ArrowUp']);
	pushTab('splitRight');
	pushTab('splitLeft');
	pushTab('splitUp');
	pushTab('splitDown');
	pushTab('moveNextPane');
	pushTab('movePrevPane');

	const splits: KeyboardControl<SplitData>[] = [];
	const pushSplit = (action: ActionId, extraKeys: string[] = []) => {
		const binding = bindings[action];
		const handler = splitHandlers[action];
		if (!handler) return;
		splits.push({
			shortcuts: [binding, ...extraKeys.map((key) => ({ modifier: binding.modifier, key }))],
			action: handler
		});
	};
	const perpendicularOf = (key: string) => {
		const other = perpendicular(key);
		return other ? [other] : [];
	};
	pushSplit('deselect');
	pushSplit('resizeSmaller', perpendicularOf(bindings.resizeSmaller.key));
	pushSplit('resizeBigger', perpendicularOf(bindings.resizeBigger.key));
	pushSplit('resizeMin');
	pushSplit('resizeMax');

	return { splitControls: splits, tabGroupControls: tabGroup };
}

function perpendicular(key: string): string | null {
	if (key === 'ArrowRight') return 'ArrowDown';
	if (key === 'ArrowDown') return 'ArrowRight';
	if (key === 'ArrowLeft') return 'ArrowUp';
	if (key === 'ArrowUp') return 'ArrowLeft';
	return null;
}

function tabGroupActions(
	layout: DemoLayout
): Partial<Record<ActionId, (tg: TabGroupConfig, event: KeyboardEvent) => void>> {
	return {
		deselect: (_, event) => (event.currentTarget as HTMLElement).blur(),
		cycleNext: (tg) => (tg.activeTabIndex = (tg.activeTabIndex + 1) % tg.tabs.length),
		cyclePrev: (tg) =>
			(tg.activeTabIndex = (tg.activeTabIndex + tg.tabs.length - 1) % tg.tabs.length),
		moveTabNext: (tg) => moveTabInGroup(tg, 1),
		moveTabPrev: (tg) => moveTabInGroup(tg, -1),
		splitRight: (tg) => split(layout, tg, 'right'),
		splitLeft: (tg) => split(layout, tg, 'left'),
		splitUp: (tg) => split(layout, tg, 'up'),
		splitDown: (tg) => split(layout, tg, 'down'),
		moveNextPane: (tg) => moveTabToClosest(layout, tg, 'right'),
		movePrevPane: (tg) => moveTabToClosest(layout, tg, 'left')
	};
}

function splitActions(
	layout: DemoLayout
): Partial<Record<ActionId, (data: SplitData, event: KeyboardEvent) => void>> {
	return {
		deselect: (_, event) => (event.currentTarget as HTMLElement).blur(),
		resizeBigger: (data) =>
			moveSplit(layout, data.config, data.index, data.config.splitPoints[data.index]! + 0.01),
		resizeSmaller: (data) =>
			moveSplit(layout, data.config, data.index, data.config.splitPoints[data.index]! - 0.01),
		resizeMin: (data) => moveSplit(layout, data.config, data.index, 0),
		resizeMax: (data) => moveSplit(layout, data.config, data.index, 1)
	};
}

// Actions that only touch the config object they receive.
function moveTabInGroup(tg: TabGroupConfig, dir: 1 | -1) {
	const count = tg.tabs.length;
	if (count < 2) return;
	const target = (tg.activeTabIndex + dir + count) % count;
	const [tab] = tg.tabs.splice(tg.activeTabIndex, 1);
	if (!tab) return;
	tg.tabs.splice(target, 0, tab);
	tg.activeTabIndex = target;
}

// Actions that need the full tree: locate the matching external tab group, docked or
// floating, via the active view id (view ids are unique across the layout).
function findExternalTabGroup(layout: DemoLayout, tg: TabGroupConfig): TabGroupConfig | null {
	const activeId = tg.tabs[tg.activeTabIndex];
	return (activeId && findTabGroup(layout.config, activeId)) || null;
}

function isFloatingGroup(layout: DemoLayout, group: TabGroupConfig): boolean {
	return layout.config.floating?.some((floating) => floating === group) ?? false;
}

// Docks the active tab of a floating group: into the last or first docked group, or (`asPane`)
// as a new pane around the whole docked layout, when maxDepth leaves room for one more level.
// The library's own controls also keep the panes' minimum sizes; this demo keeps it short.
function dock(layout: DemoLayout, group: TabGroupConfig, direction: Direction, asPane: boolean) {
	const { config } = layout;
	if (asPane && config.root && depthOf(config.root) + 1 > layout.maxDepth) return;
	const id: Id = group.tabs[group.activeTabIndex]!;
	const isFirst = direction === 'left' || direction === 'up';
	removeView(config, id);
	const pane: TabGroupConfig = { tabs: [id], activeTabIndex: 0 };
	if (!config.root) {
		config.root = pane;
	} else if (asPane) {
		config.root = {
			direction: direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical',
			views: isFirst ? [pane, config.root] : [config.root, pane],
			splitPoints: [0.5]
		};
	} else {
		const target = isFirst ? firstTabGroup(config.root) : lastTabGroup(config.root);
		target.tabs.push(id);
		target.activeTabIndex = target.tabs.length - 1;
	}
}

function paneMidpoint(entry: { parent: SplitConfig; index: number }): number {
	return (
		((entry.parent.splitPoints[entry.index - 1] ?? 0) +
			(entry.parent.splitPoints[entry.index] ?? 1)) /
		2
	);
}

function canSplit(
	layout: DemoLayout,
	group: TabGroupConfig,
	splitDirection: 'horizontal' | 'vertical'
): boolean {
	if (!layout.config.root) return false;
	const map = buildNodeParentMap(layout.config.root);
	const minRatio = splitDirection === 'horizontal' ? layout.minWidthRatio : layout.minHeightRatio;
	const entry = map.get(group);
	if (entry?.parent.direction === splitDirection) {
		return (
			((entry.parent.splitPoints[entry.index] ?? 1) -
				(entry.parent.splitPoints[entry.index - 1] ?? 0)) /
				2 >=
			minRatio
		);
	}
	const depth = (node: NodeConfig, d = 1): number => {
		const parent = map.get(node);
		return parent ? depth(parent.parent, d + 1) : d;
	};
	return depth(group) + 1 <= layout.maxDepth;
}

function split(layout: DemoLayout, tg: TabGroupConfig, direction: Direction) {
	const { config } = layout;
	const group = findExternalTabGroup(layout, tg);
	if (group && isFloatingGroup(layout, group)) {
		dock(layout, group, direction, true);
		return;
	}
	if (!group || group.tabs.length < 2 || !config.root) return;
	const splitDirection = direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
	if (!canSplit(layout, group, splitDirection)) return;

	const map = buildNodeParentMap(config.root);
	const entry = map.get(group);
	const activeId = group.tabs[group.activeTabIndex]!;
	const oldActive = group.activeTabIndex;
	const isFirst = direction === 'left' || direction === 'up';
	const newGroup: TabGroupConfig = { tabs: [activeId], activeTabIndex: 0 };

	group.tabs = group.tabs.filter((_, i) => i !== oldActive) as [Id, ...Id[]];
	group.activeTabIndex = Math.min(oldActive, group.tabs.length - 1);

	if (!entry || entry.parent.direction !== splitDirection) {
		const newSplit: SplitConfig = {
			direction: splitDirection,
			views: isFirst ? [newGroup, group] : [group, newGroup],
			splitPoints: [0.5]
		};
		if (entry) entry.parent.views[entry.index] = newSplit;
		else config.root = newSplit;
	} else {
		entry.parent.views.splice(entry.index + (isFirst ? 0 : 1), 0, newGroup);
		entry.parent.splitPoints.splice(entry.index, 0, paneMidpoint(entry));
	}
}

function moveTabToClosest(layout: DemoLayout, tg: TabGroupConfig, direction: Direction) {
	const { config } = layout;
	const source = findExternalTabGroup(layout, tg);
	if (source && isFloatingGroup(layout, source)) {
		dock(layout, source, direction, false);
		return;
	}
	if (!source || !config.root) return;
	const map = buildNodeParentMap(config.root);
	const axis = direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
	const isLeftUp = direction === 'left' || direction === 'up';
	const sourceTab = source.tabs[source.activeTabIndex]!;

	const edge = (node: NodeConfig): TabGroupConfig => {
		if (nodeConfigType(node) === 'tabGroup') return node as TabGroupConfig;
		const splitNode = node as SplitConfig;
		return edge(splitNode.views[isLeftUp ? splitNode.views.length - 1 : 0]!);
	};

	const walk = (child: NodeConfig): void => {
		const entry = map.get(child);
		if (!entry) return;
		if (entry.parent.direction !== axis) return walk(entry.parent);
		const targetIndex = entry.index + (isLeftUp ? -1 : 1);
		if (targetIndex < 0 || targetIndex >= entry.parent.views.length) return walk(entry.parent);

		source.tabs.splice(source.activeTabIndex, 1);
		source.activeTabIndex = Math.min(source.activeTabIndex, source.tabs.length - 1);
		simplifyTabGroup(source, map, config);
		const destination = edge(entry.parent.views[targetIndex]!);
		destination.activeTabIndex = destination.tabs.length;
		destination.tabs.push(sourceTab);
	};

	walk(source);
}

function moveSplit(layout: DemoLayout, splitConfig: SplitConfig, index: number, ratio: number) {
	const minRatio =
		splitConfig.direction === 'horizontal' ? layout.minWidthRatio : layout.minHeightRatio;
	const min = (splitConfig.splitPoints[index - 1] ?? 0) + minRatio;
	const max = (splitConfig.splitPoints[index + 1] ?? 1) - minRatio;
	const clamped = Number(Math.min(Math.max(ratio, min), max).toFixed(4));
	if (clamped !== splitConfig.splitPoints[index]) splitConfig.splitPoints[index] = clamped;
}
