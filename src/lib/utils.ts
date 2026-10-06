import { SvelteMap } from 'svelte/reactivity';
import { DEFAULT_MIN_WIDTH_RATIO, DEFAULT_MIN_HEIGHT_RATIO } from './internal-utils.ts';
import type {
	Id,
	LayoutConfig,
	NodeConfig,
	ParentEntry,
	SplitConfig,
	TabGroupConfig
} from './types.ts';

/// Remove a tab group that has become empty, then collapse any resulting
/// single-child splits up the tree.
export function simplifyTabGroup(
	tabGroup: TabGroupConfig,
	nodeParentMap: SvelteMap<NodeConfig, ParentEntry>,
	config: LayoutConfig
) {
	if (tabGroup.tabs.length > 0) return;

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

/// returns true if the two configs are equivalent (i.e. they represent the same layout), false otherwise
export function areConfigsEquivalent(config1: LayoutConfig, config2: LayoutConfig): boolean {
	if (config1.maximizedView !== config2.maximizedView) return false;
	if ((config1.root === undefined) !== (config2.root === undefined)) return false;
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

	const areTabGroupConfigsEquivalent = (
		tabGroup1: TabGroupConfig,
		tabGroup2: TabGroupConfig
	): boolean => {
		if (tabGroup1.activeTabIndex !== tabGroup2.activeTabIndex) return false;
		if (tabGroup1.tabs.length !== tabGroup2.tabs.length) return false;
		for (let i = 0; i < tabGroup1.tabs.length; i++) {
			if (tabGroup1.tabs[i] !== tabGroup2.tabs[i]) return false;
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

	if (config.maximizedView && !views.get(config.maximizedView)) {
		throw new Error(`unknown maximizedView id "${config.maximizedView}"`);
	}

	for (const id of config.popouts ?? []) {
		if (!views.get(id)) throw new Error(`unknown popout id "${id}"`);
	}

	if (!config.root) return;

	const seenIds = new Set<Id>();

	const validateTabGroup = (tabGroup: TabGroupConfig) => {
		if (tabGroup.activeTabIndex < 0 || tabGroup.activeTabIndex >= tabGroup.tabs.length) {
			throw new Error('activeTabIndex out of range');
		}
		for (const id of tabGroup.tabs) {
			if (!views.get(id)) throw new Error(`unknown tab id "${id}"`);
			if (seenIds.has(id)) throw new Error(`duplicate tab id "${id}"`);
			seenIds.add(id);
		}
	};

	const validateSplit = (split: SplitConfig) => {
		if (split.splitPoints.length !== split.views.length - 1) {
			throw new Error('splitPoints.length must equal views.length - 1');
		}
		const minRatio = split.direction === 'horizontal' ? minWidthRatio : minHeightRatio;
		for (let i = 0; i < split.splitPoints.length; i++) {
			const point = split.splitPoints[i]!;
			const prev = split.splitPoints[i - 1] ?? 0;
			if (point < prev + minRatio || point > 1 - minRatio) {
				throw new Error('splitPoints violate minRatio constraints');
			}
		}
		for (const child of split.views) {
			validateNode(child);
		}
	};

	const validateNode = (node: NodeConfig) =>
		nodeConfigType(node) === 'split'
			? validateSplit(node as SplitConfig)
			: validateTabGroup(node as TabGroupConfig);

	validateNode(config.root);
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

function parseId(object: unknown, path: string): Id {
	if (!object || typeof object !== 'string')
		throw new Error(`${path}: expected a non-empty string`);
	return object;
}

/// Parses an unknown value (e.g. from JSON.parse) into a LayoutConfig,
/// throwing an error if the value does not match the expected shape.
export function parseLayoutConfig(object: unknown): LayoutConfig {
	if (typeof object !== 'object' || object === null) throw new Error('root: expected an object');
	const { root, maximizedView, popouts } = object as Record<string, unknown>;
	const result: LayoutConfig = {};
	if (root != null) result.root = parseNodeConfig(root, 'config.root');
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

	return {
		...(config.root ? { root: cloneNodeConfig(config.root) } : {}),
		...(config.maximizedView ? { maximizedView: config.maximizedView } : {}),
		...(config.popouts && config.popouts.length > 0 ? { popouts: [...config.popouts] } : {})
	};
}
