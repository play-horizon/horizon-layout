/**
 * The public helpers that work on a `LayoutConfig`: parsing an unknown value into one, validating
 * it against the views, cloning and comparing configs, walking the docked tree, and changing a
 * config in place (finding, removing and floating views, removing emptied tab groups).
 * HorizonLayout uses them too; `index.ts` re-exports them all.
 * @module
 */
import { SvelteMap } from 'svelte/reactivity';
import {
	DEFAULT_MIN_WIDTH_RATIO,
	DEFAULT_MIN_HEIGHT_RATIO,
	DEFAULT_MAX_DEPTH,
	roundSplitPoint
} from './internal-utils.ts';
import type {
	FloatingGroupConfig,
	FloatingRect,
	Id,
	LayoutConfig,
	NodeConfig,
	ParentEntry,
	SplitConfig,
	TabGroupConfig
} from './types.ts';

/**
 * Removes `tabGroup` from `config`, in place, when it has no tabs left (it does nothing
 * otherwise): a floating group leaves `config.floating` (which goes when it is left empty); a
 * docked one leaves its split, whose split point next to it goes too, then each split left with
 * a single child is replaced by that child, up the tree; the last docked group clears
 * `config.root`. `nodeParentMap` is the map `buildNodeParentMap` built for `config.root`.
 *
 * @example
 * group.tabs.splice(group.tabs.indexOf('docs'), 1);
 * simplifyTabGroup(group, buildNodeParentMap(config.root), config);
 */
export function simplifyTabGroup(
	tabGroup: TabGroupConfig,
	nodeParentMap: ReadonlyMap<NodeConfig, ParentEntry>,
	config: LayoutConfig
) {
	if (tabGroup.tabs.length > 0) return;

	const floatingIndex = config.floating?.indexOf(tabGroup as FloatingGroupConfig) ?? -1;
	if (floatingIndex !== -1) {
		config.floating!.splice(floatingIndex, 1);
		if (config.floating!.length === 0) config.floating = undefined;
		return;
	}

	const parent = nodeParentMap.get(tabGroup);
	if (!parent) {
		config.root = undefined;
		return;
	}

	parent.parent.views.splice(parent.index, 1);
	parent.parent.splitPoints.splice(Math.min(parent.index, parent.parent.splitPoints.length - 1), 1);

	// Replaces a split left with a single view by that view, then does the same for its parent.
	const simplifySplit = (split: SplitConfig) => {
		if (split.views.length > 1) return;
		const only = split.views[0]!;
		const splitParent = nodeParentMap.get(split);
		if (splitParent) {
			splitParent.parent.views[splitParent.index] = only;
			simplifySplit(splitParent.parent);
		} else {
			config.root = only;
		}
	};

	simplifySplit(parent.parent);
}

/** Returns `'split'` for a `SplitConfig` and `'tabGroup'` for a `TabGroupConfig`. */
export function nodeConfigType(config: NodeConfig): 'split' | 'tabGroup' {
	if ('splitPoints' in config) {
		return 'split';
	} else {
		return 'tabGroup';
	}
}

/**
 * Returns a map from every node of the docked tree under `root`, `root` excepted, to the split
 * holding it and its index there. It reflects the tree when it is built: rebuild it after the
 * tree changes.
 */
export function buildNodeParentMap(root: NodeConfig): SvelteMap<NodeConfig, ParentEntry> {
	const map = new SvelteMap<NodeConfig, ParentEntry>();

	function walk(node: NodeConfig, parent: ParentEntry | null = null) {
		if (parent) map.set(node, parent);
		if (nodeConfigType(node) === 'split') {
			const split = node as SplitConfig;
			for (let i = 0; i < split.views.length; i++) {
				walk(split.views[i]!, { parent: split, index: i });
			}
		}
	}

	walk(root);
	return map;
}

function areTabGroupConfigsEquivalent(
	tabGroup1: TabGroupConfig,
	tabGroup2: TabGroupConfig
): boolean {
	if (tabGroup1.activeTabIndex !== tabGroup2.activeTabIndex) return false;
	if (tabGroup1.tabs.length !== tabGroup2.tabs.length) return false;
	for (let i = 0; i < tabGroup1.tabs.length; i++) {
		if (tabGroup1.tabs[i] !== tabGroup2.tabs[i]) return false;
	}
	return true;
}

/**
 * Returns whether two configs describe the same layout: the same tree, floating groups (in the
 * same order, with the same rect), maximized view, and popouts (in any order).
 */
export function areConfigsEquivalent(config1: LayoutConfig, config2: LayoutConfig): boolean {
	if (config1.maximizedView !== config2.maximizedView) return false;
	if ((config1.root === undefined) !== (config2.root === undefined)) return false;
	const floating1 = config1.floating ?? [];
	const floating2 = config2.floating ?? [];
	if (floating1.length !== floating2.length) return false;
	for (let i = 0; i < floating1.length; i++) {
		const [group1, group2] = [floating1[i]!, floating2[i]!];
		if (!areTabGroupConfigsEquivalent(group1, group2)) return false;
		const [rect1, rect2] = [group1.rect, group2.rect];
		if (rect1.x !== rect2.x || rect1.y !== rect2.y) return false;
		if (rect1.width !== rect2.width || rect1.height !== rect2.height) return false;
	}
	const popouts1 = [...(config1.popouts ?? [])].sort();
	const popouts2 = [...(config2.popouts ?? [])].sort();
	if (popouts1.length !== popouts2.length) return false;
	for (let i = 0; i < popouts1.length; i++) {
		if (popouts1[i] !== popouts2[i]) return false;
	}

	const areNodeConfigsEquivalent = (node1: NodeConfig, node2: NodeConfig): boolean => {
		const node_type = nodeConfigType(node1);
		if (node_type !== nodeConfigType(node2)) return false;
		return node_type === 'split'
			? areSplitConfigsEquivalent(node1 as SplitConfig, node2 as SplitConfig)
			: areTabGroupConfigsEquivalent(node1 as TabGroupConfig, node2 as TabGroupConfig);
	};

	const areSplitConfigsEquivalent = (split1: SplitConfig, split2: SplitConfig): boolean => {
		if (split1.direction !== split2.direction) return false;
		if (split1.splitPoints.length !== split2.splitPoints.length) return false;
		for (let i = 0; i < split1.splitPoints.length; i++) {
			if (split1.splitPoints[i] !== split2.splitPoints[i]) return false;
		}
		if (split1.views.length !== split2.views.length) return false;
		for (let i = 0; i < split1.views.length; i++) {
			if (!areNodeConfigsEquivalent(split1.views[i]!, split2.views[i]!)) return false;
		}
		return true;
	};

	// Both roots are absent or both present: that was checked first.
	if (config1.root === undefined) return true;

	return areNodeConfigsEquivalent(config1.root, config2.root!);
}

/** The thresholds `validateConfig` checks split points with. */
export interface ValidateConfigOptions {
	/** Minimum pane width, as a fraction of its horizontal split's width, from 0 to 0.5. Default: 0.1. */
	minWidthRatio?: number;
	/** Minimum pane height, as a fraction of its vertical split's height, from 0 to 0.5. Default: 0.2. */
	minHeightRatio?: number;
	/**
	 * How deep the docked layout may nest, counted in tab groups: a lone tab group is 1 deep, a
	 * split of tab groups 2. An integer of at least 1. Default: 6.
	 */
	maxDepth?: number;
}

/**
 * Checks that `config` can be shown with `views`: every id names a view, no view is shown twice,
 * every `activeTabIndex` is the index of a tab, every split has two views or more and split
 * points that leave each pane its minimum ratio, the docked layout nests no deeper than
 * `maxDepth`, every floating rect has finite numbers and a positive size, and the maximized view
 * isn't in a popout. Pass the `minWidthRatio`, `minHeightRatio` and `maxDepth` given to
 * HorizonLayout, so the config is checked with its limits; like HorizonLayout, it takes the
 * ratios, and the split points, at the 4-decimal precision split points are stored with.
 *
 * @throws Error naming the first faulty field by its path (or the option out of its range, for
 * example `options.maxDepth: expected an integer of at least 1, got 0`), for example
 * `config.root.views[1].activeTabIndex: expected an integer from 0 to 2, the index of a tab`.
 *
 * @example
 * validateConfig(config, views, { minWidthRatio: 0.15 });
 */
export function validateConfig<V>(
	config: LayoutConfig,
	views: ReadonlyMap<Id, V>,
	options: ValidateConfigOptions = {}
) {
	for (const name of ['minWidthRatio', 'minHeightRatio'] as const) {
		const ratio = options[name];
		// Written so NaN fails too.
		if (ratio !== undefined && !(ratio >= 0 && ratio <= 0.5)) {
			throw new Error(`options.${name}: expected a number from 0 to 0.5, got ${ratio}`);
		}
	}
	const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
	if (!Number.isInteger(maxDepth) || maxDepth < 1) {
		throw new Error(`options.maxDepth: expected an integer of at least 1, got ${maxDepth}`);
	}
	// At the precision split points are stored with, as HorizonLayout applies them.
	const minWidthRatio = roundSplitPoint(options.minWidthRatio ?? DEFAULT_MIN_WIDTH_RATIO);
	const minHeightRatio = roundSplitPoint(options.minHeightRatio ?? DEFAULT_MIN_HEIGHT_RATIO);

	if (config.maximizedView && !views.has(config.maximizedView)) {
		throw new Error(`config.maximizedView: unknown view id "${config.maximizedView}"`);
	}
	// A popout's window already shows the view: maximizing it too would render it twice.
	if (config.maximizedView && config.popouts?.includes(config.maximizedView)) {
		throw new Error(`config.maximizedView: view "${config.maximizedView}" is in a popout`);
	}

	// A view is shown in one place: one tab, docked or floating, or one popout.
	const seenIds = new Set<Id>();

	for (const [i, id] of (config.popouts ?? []).entries()) {
		if (!views.has(id)) throw new Error(`config.popouts[${i}]: unknown view id "${id}"`);
		if (seenIds.has(id))
			throw new Error(`config.popouts[${i}]: view "${id}" is shown more than once`);
		seenIds.add(id);
	}

	const validateTabGroup = (tabGroup: TabGroupConfig, path: string) => {
		const { tabs, activeTabIndex } = tabGroup;
		if (tabs.length === 0) throw new Error(`${path}.tabs: expected at least one tab`);
		if (!Number.isInteger(activeTabIndex) || activeTabIndex < 0 || activeTabIndex >= tabs.length) {
			throw new Error(
				`${path}.activeTabIndex: expected an integer from 0 to ${tabs.length - 1}, the index of a tab`
			);
		}
		for (const [i, id] of tabs.entries()) {
			if (!views.has(id)) throw new Error(`${path}.tabs[${i}]: unknown view id "${id}"`);
			if (seenIds.has(id))
				throw new Error(`${path}.tabs[${i}]: view "${id}" is shown more than once`);
			seenIds.add(id);
		}
	};

	const validateSplit = (split: SplitConfig, path: string, depth: number) => {
		if (split.views.length < 2) throw new Error(`${path}.views: expected at least two views`);
		if (split.splitPoints.length !== split.views.length - 1) {
			throw new Error(`${path}.splitPoints: expected one split point per gap between views`);
		}
		const minRatio = split.direction === 'horizontal' ? minWidthRatio : minHeightRatio;
		for (let i = 0; i < split.splitPoints.length; i++) {
			if (!Number.isFinite(split.splitPoints[i])) {
				throw new Error(`${path}.splitPoints[${i}]: expected a finite number`);
			}
			const point = roundSplitPoint(split.splitPoints[i]!);
			const prev = roundSplitPoint(split.splitPoints[i - 1] ?? 0);
			if (point < roundSplitPoint(prev + minRatio) || point > roundSplitPoint(1 - minRatio)) {
				throw new Error(`${path}.splitPoints[${i}]: leaves a pane smaller than the minimum ratio`);
			}
		}
		for (const [i, child] of split.views.entries()) {
			validateNode(child, `${path}.views[${i}]`, depth + 1);
		}
	};

	// `depth` is how deep `node` is: the root is 1 deep, its views 2, and so on.
	const validateNode = (node: NodeConfig, path: string, depth: number) => {
		if (depth > maxDepth) {
			throw new Error(`${path}: nested ${depth} deep, deeper than maxDepth (${maxDepth})`);
		}
		if (nodeConfigType(node) === 'split') validateSplit(node as SplitConfig, path, depth);
		else validateTabGroup(node as TabGroupConfig, path);
	};

	for (const [i, group] of (config.floating ?? []).entries()) {
		validateTabGroup(group, `config.floating[${i}]`);
		const { x, y, width, height } = group.rect;
		if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
			throw new Error(
				`config.floating[${i}].rect: expected finite numbers and a positive width and height`
			);
		}
	}

	if (config.root) validateNode(config.root, 'config.root', 1);
}

// Any of a split's fields makes `object` a split, so a malformed split reports what it lacks
// rather than being read as a tab group without tabs.
function parseNodeConfig(object: unknown, path: string): NodeConfig {
	if (typeof object !== 'object' || object === null) throw new Error(`${path}: expected an object`);
	const isSplit = 'direction' in object || 'views' in object || 'splitPoints' in object;
	return isSplit ? parseSplitConfig(object, path) : parseTabGroupConfig(object, path);
}

function parseSplitConfig(object: unknown, path: string): SplitConfig {
	if (typeof object !== 'object' || object === null) throw new Error(`${path}: expected an object`);
	const obj = object as Record<string, unknown>;
	const { direction, views, splitPoints } = obj;
	if (direction !== 'horizontal' && direction !== 'vertical')
		throw new Error(`${path}.direction: expected "horizontal" or "vertical"`);
	if (!Array.isArray(views) || views.length < 2)
		throw new Error(`${path}.views: expected an array of at least 2 elements`);
	if (!Array.isArray(splitPoints) || splitPoints.length < 1)
		throw new Error(`${path}.splitPoints: expected a non-empty array`);
	for (let i = 0; i < splitPoints.length; i++) {
		if (typeof splitPoints[i] !== 'number')
			throw new Error(`${path}.splitPoints[${i}]: expected a number`);
	}
	return {
		direction,
		views: views.map((v, i) => parseNodeConfig(v, `${path}.views[${i}]`)) as [
			NodeConfig,
			NodeConfig,
			...NodeConfig[]
		],
		splitPoints: [...splitPoints] as [number, ...number[]]
	};
}

function parseTabGroupConfig(object: unknown, path: string): TabGroupConfig {
	if (typeof object !== 'object' || object === null) throw new Error(`${path}: expected an object`);
	const { tabs, activeTabIndex } = object as Record<string, unknown>;
	if (!Array.isArray(tabs) || tabs.length < 1)
		throw new Error(`${path}.tabs: expected a non-empty array`);
	if (typeof activeTabIndex !== 'number')
		throw new Error(`${path}.activeTabIndex: expected a number`);
	return {
		tabs: tabs.map((t, i) => parseId(t, `${path}.tabs[${i}]`)) as [Id, ...Id[]],
		activeTabIndex
	};
}

function parseFloatingGroupConfig(object: unknown, path: string): FloatingGroupConfig {
	const group = parseTabGroupConfig(object, path);
	const { rect } = object as Record<string, unknown>;
	if (typeof rect !== 'object' || rect === null)
		throw new Error(`${path}.rect: expected an object`);
	const { x, y, width, height } = rect as Record<string, unknown>;
	const numbers = { x, y, width, height };
	for (const [key, value] of Object.entries(numbers)) {
		if (typeof value !== 'number') throw new Error(`${path}.rect.${key}: expected a number`);
	}
	return { ...group, rect: numbers as FloatingRect };
}

function parseId(object: unknown, path: string): Id {
	if (!object || typeof object !== 'string')
		throw new Error(`${path}: expected a non-empty string`);
	return object;
}

/**
 * Parses an unknown value (for example from `JSON.parse`) into a new `LayoutConfig`, checking its
 * shape only (run `validateConfig` for the rest). Unknown fields are dropped, as are empty
 * `floating` and `popouts` arrays.
 *
 * @throws Error naming the first faulty field by its path, for example
 * `config.root.views[0].tabs: expected a non-empty array`.
 *
 * @example
 * const config = parseLayoutConfig(JSON.parse(localStorage.getItem('layout') ?? '{}'));
 */
export function parseLayoutConfig(object: unknown): LayoutConfig {
	if (typeof object !== 'object' || object === null) throw new Error('config: expected an object');
	const { root, floating, maximizedView, popouts } = object as Record<string, unknown>;
	const result: LayoutConfig = {};
	if (root != null) result.root = parseNodeConfig(root, 'config.root');
	if (floating != null) {
		if (!Array.isArray(floating)) throw new Error('config.floating: expected an array');
		if (floating.length > 0) {
			result.floating = floating.map((group, i) =>
				parseFloatingGroupConfig(group, `config.floating[${i}]`)
			);
		}
	}
	if (maximizedView != null) result.maximizedView = parseId(maximizedView, 'config.maximizedView');
	if (popouts != null) {
		if (!Array.isArray(popouts)) throw new Error('config.popouts: expected an array');
		if (popouts.length > 0) {
			result.popouts = popouts.map((p, i) => parseId(p, `config.popouts[${i}]`));
		}
	}
	return result;
}

/**
 * Returns a deep copy of `config` that shares no object with it, without empty `floating` and
 * `popouts` arrays.
 */
export function cloneConfig(config: LayoutConfig): LayoutConfig {
	const cloneNodeConfig = (node: NodeConfig): NodeConfig => {
		return nodeConfigType(node) === 'split'
			? cloneSplitConfig(node as SplitConfig)
			: cloneTabGroupConfig(node as TabGroupConfig);
	};

	const cloneSplitConfig = (split: SplitConfig): SplitConfig => {
		return {
			direction: split.direction,
			views: split.views.map(cloneNodeConfig) as [NodeConfig, NodeConfig, ...NodeConfig[]],
			splitPoints: [...split.splitPoints] as [number, ...number[]]
		};
	};

	const cloneTabGroupConfig = (tabGroup: TabGroupConfig): TabGroupConfig => {
		return {
			tabs: [...tabGroup.tabs] as [Id, ...Id[]],
			activeTabIndex: tabGroup.activeTabIndex
		};
	};

	const cloneFloatingGroupConfig = (group: FloatingGroupConfig): FloatingGroupConfig => ({
		...cloneTabGroupConfig(group),
		rect: { x: group.rect.x, y: group.rect.y, width: group.rect.width, height: group.rect.height }
	});

	return {
		...(config.root ? { root: cloneNodeConfig(config.root) } : {}),
		...(config.floating && config.floating.length > 0
			? { floating: config.floating.map(cloneFloatingGroupConfig) }
			: {}),
		...(config.maximizedView ? { maximizedView: config.maximizedView } : {}),
		...(config.popouts && config.popouts.length > 0 ? { popouts: [...config.popouts] } : {})
	};
}

/**
 * Returns the tab group, docked or floating, that has the view `id` as one of its tabs, or
 * undefined when the view isn't in a tab group (absent, or only in `popouts`).
 *
 * @example
 * const group = findTabGroup(config, 'docs');
 * if (group) group.activeTabIndex = group.tabs.indexOf('docs');
 */
export function findTabGroup(config: LayoutConfig, id: Id): TabGroupConfig | undefined {
	const walk = (node: NodeConfig): TabGroupConfig | undefined => {
		if (nodeConfigType(node) === 'tabGroup') {
			return (node as TabGroupConfig).tabs.includes(id) ? (node as TabGroupConfig) : undefined;
		}
		for (const child of (node as SplitConfig).views) {
			const found = walk(child);
			if (found) return found;
		}
		return undefined;
	};
	return (
		(config.root && walk(config.root)) ?? config.floating?.find((group) => group.tabs.includes(id))
	);
}

/**
 * Takes the view `id` out of the layout, in place: out of its tab group (a group left empty is
 * removed, and the splits it leaves collapse), out of `popouts`, and out of `maximizedView`.
 * Does nothing for a view the layout doesn't show.
 *
 * @example
 * removeView(config, 'docs');
 */
export function removeView(config: LayoutConfig, id: Id): void {
	const group = findTabGroup(config, id);
	if (group) {
		const index = group.tabs.indexOf(id);
		group.tabs.splice(index, 1);
		if (index < group.activeTabIndex) group.activeTabIndex -= 1;
		group.activeTabIndex = Math.max(Math.min(group.activeTabIndex, group.tabs.length - 1), 0);
		const parents = config.root ? buildNodeParentMap(config.root) : new Map();
		simplifyTabGroup(group, parents, config);
	}
	if (config.popouts?.includes(id)) {
		const remaining = config.popouts.filter((popout) => popout !== id);
		config.popouts = remaining.length > 0 ? remaining : undefined;
	}
	if (config.maximizedView === id) config.maximizedView = undefined;
}

/**
 * Floats the view `id` in a group of its own at `rect`, on top of the other floating groups,
 * in place: the view first leaves wherever it was (see `removeView`).
 *
 * @example
 * floatView(config, 'docs', { x: 80, y: 60, width: 420, height: 520 });
 */
export function floatView(config: LayoutConfig, id: Id, rect: FloatingRect): void {
	removeView(config, id);
	const group: FloatingGroupConfig = { tabs: [id], activeTabIndex: 0, rect: { ...rect } };
	config.floating = [...(config.floating ?? []), group];
}
