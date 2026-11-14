import { SvelteMap } from 'svelte/reactivity';
import {
	DEFAULT_MIN_WIDTH_RATIO,
	DEFAULT_MIN_HEIGHT_RATIO,
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

/// Remove a tab group that has become empty: a floating group leaves `config.floating`; a docked
/// one leaves its split, then any resulting single-child splits collapse up the tree.
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

	/// Remove a split that has become a single view, then collapse any resulting
	/// single-child splits up the tree.
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

/// returns 'split' if the config is a SplitConfig, or 'tabGroup' if it's a TabGroupConfig
export function nodeConfigType(config: NodeConfig): 'split' | 'tabGroup' {
	if ('splitPoints' in config) {
		return 'split';
	} else {
		return 'tabGroup';
	}
}

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

/// returns true if the two configs are equivalent (i.e. they represent the same layout), false otherwise
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

	// we can only check config1 because of the early return
	// if ((config1.root === undefined) !== (config2.root === undefined)) return false;
	if (config1.root === undefined) return true;

	return areNodeConfigsEquivalent(config1.root, config2.root!);
}

export interface ValidateConfigOptions {
	/** Minimum allowed pane width as a fraction of its split container. Default: DEFAULT_MIN_WIDTH_RATIO */
	minWidthRatio?: number;
	/** Minimum allowed pane height as a fraction of its split container. Default: DEFAULT_MIN_HEIGHT_RATIO */
	minHeightRatio?: number;
}

/// Validates a LayoutConfig against a views map.
/// Throws an Error if the config is invalid.
/// Pass the same minWidthRatio / minHeightRatio you use for HorizonLayout so that
/// split-point constraints are checked with the same thresholds.
export function validateConfig<V>(
	config: LayoutConfig,
	views: ReadonlyMap<Id, V>,
	options: ValidateConfigOptions = {}
) {
	const { minWidthRatio = DEFAULT_MIN_WIDTH_RATIO, minHeightRatio = DEFAULT_MIN_HEIGHT_RATIO } =
		options;

	if (config.maximizedView && !views.has(config.maximizedView)) {
		throw new Error(`config.maximizedView: unknown view id "${config.maximizedView}"`);
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
		if (tabGroup.activeTabIndex < 0 || tabGroup.activeTabIndex >= tabGroup.tabs.length) {
			throw new Error(`${path}.activeTabIndex: out of range`);
		}
		for (const [i, id] of tabGroup.tabs.entries()) {
			if (!views.has(id)) throw new Error(`${path}.tabs[${i}]: unknown view id "${id}"`);
			if (seenIds.has(id))
				throw new Error(`${path}.tabs[${i}]: view "${id}" is shown more than once`);
			seenIds.add(id);
		}
	};

	const validateSplit = (split: SplitConfig, path: string) => {
		if (split.splitPoints.length !== split.views.length - 1) {
			throw new Error(`${path}.splitPoints: expected one split point per gap between views`);
		}
		const minRatio = split.direction === 'horizontal' ? minWidthRatio : minHeightRatio;
		for (let i = 0; i < split.splitPoints.length; i++) {
			const point = roundSplitPoint(split.splitPoints[i]!);
			const prev = split.splitPoints[i - 1] ?? 0;
			if (point < roundSplitPoint(prev + minRatio) || point > roundSplitPoint(1 - minRatio)) {
				throw new Error(`${path}.splitPoints[${i}]: leaves a pane smaller than the minimum ratio`);
			}
		}
		for (const [i, child] of split.views.entries()) {
			validateNode(child, `${path}.views[${i}]`);
		}
	};

	const validateNode = (node: NodeConfig, path: string) =>
		nodeConfigType(node) === 'split'
			? validateSplit(node as SplitConfig, path)
			: validateTabGroup(node as TabGroupConfig, path);

	for (const [i, group] of (config.floating ?? []).entries()) {
		validateTabGroup(group, `config.floating[${i}]`);
		const { x, y, width, height } = group.rect;
		if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
			throw new Error(
				`config.floating[${i}].rect: expected finite numbers and a positive width and height`
			);
		}
	}

	if (config.root) validateNode(config.root, 'config.root');
}

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

/// Parses an unknown value (e.g. from JSON.parse) into a LayoutConfig,
/// throwing an error if the value does not match the expected shape.
export function parseLayoutConfig(object: unknown): LayoutConfig {
	if (typeof object !== 'object' || object === null) throw new Error('root: expected an object');
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
	if (Array.isArray(popouts) && popouts.length > 0)
		result.popouts = popouts.map((p, i) => parseId(p, `config.popouts[${i}]`));
	return result;
}

/// returns a deep clone of the given config
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

/// Returns the tab group, docked or floating, that has the view `id` as one of its tabs, or
/// undefined when the view isn't in a tab group (absent, or only in `popouts`).
///
/// ```ts
/// const group = findTabGroup(config, 'docs');
/// if (group) group.activeTabIndex = group.tabs.indexOf('docs');
/// ```
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

/// Takes the view `id` out of the layout, in place: out of its tab group (a group left empty is
/// removed, and the splits it leaves collapse), out of `popouts`, and out of `maximizedView`.
/// Does nothing for a view the layout doesn't show.
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

/// Floats the view `id` in a group of its own at `rect`, on top of the other floating groups,
/// in place: the view first leaves wherever it was (see `removeView`).
///
/// ```ts
/// floatView(config, 'docs', { x: 80, y: 60, width: 420, height: 520 });
/// ```
export function floatView(config: LayoutConfig, id: Id, rect: FloatingRect): void {
	removeView(config, id);
	const group: FloatingGroupConfig = { tabs: [id], activeTabIndex: 0, rect: { ...rect } };
	config.floating = [...(config.floating ?? []), group];
}
