/**
 * Applies a new layout config onto the one HorizonLayout renders, in place: every node that is
 * still there, holding the same views under the same split, stays the same object, so the
 * components rendering it, and the views they show, stay mounted. Internal to the library.
 * @module
 */
import type {
	FloatingGroupConfig,
	FloatingRect,
	Id,
	LayoutConfig,
	NodeConfig,
	SplitConfig,
	TabGroupConfig
} from './types.ts';
import { cloneConfig, nodeConfigType } from './utils.ts';

/**
 * Makes `target` equal to `source` (as `areConfigsEquivalent` sees it), changing `target` in
 * place. Within each split, and among the floating groups, the target's nodes are matched to the
 * source's by the views they hold and show, so a node keeps its object when siblings come or go.
 * `source` is only read; nothing of it ends up shared with `target`.
 */
export function reconcileConfig(target: LayoutConfig, source: LayoutConfig): void {
	const copy = cloneConfig(source);

	if (target.root && copy.root && nodeConfigType(target.root) === nodeConfigType(copy.root)) {
		reconcileNode(target.root, copy.root);
	} else if (target.root !== copy.root) {
		target.root = copy.root;
	}
	reconcileFloating(target, copy.floating ?? []);
	if (target.maximizedView !== copy.maximizedView) target.maximizedView = copy.maximizedView;
	if (!sameItems(target.popouts ?? [], copy.popouts ?? [])) target.popouts = copy.popouts;
}

/// Brings `target` to `source`, both of the same kind; `source` is a private copy whose nodes
/// may be moved into `target`.
function reconcileNode(target: NodeConfig, source: NodeConfig): void {
	if (nodeConfigType(target) === 'tabGroup') {
		reconcileTabGroup(target as TabGroupConfig, source as TabGroupConfig);
		return;
	}
	const split = target as SplitConfig;
	const next = source as SplitConfig;
	if (split.direction !== next.direction) split.direction = next.direction;
	if (!sameItems(split.splitPoints, next.splitPoints)) split.splitPoints = next.splitPoints;
	const views = reconcileChildren(split.views, next.views);
	if (!sameItems(split.views, views)) split.views = views as SplitConfig['views'];
}

function reconcileFloating(target: LayoutConfig, source: FloatingGroupConfig[]): void {
	if (source.length === 0) {
		if (target.floating) target.floating = undefined;
		return;
	}
	const current = target.floating ?? [];
	const floating = reconcileChildren(current, source);
	if (!sameItems(current, floating)) target.floating = floating;
}

/**
 * Returns the nodes `wanted` asks for, in its order, each one a node of `current` brought to it,
 * or the wanted node itself when no node of `current` fits it. Nodes fit when they are of the same
 * kind and share views; the best fits are paired first, so a node keeps the object that shows its
 * panels (only the active view of a tab group is mounted) wherever it moves.
 */
function reconcileChildren<T extends NodeConfig>(current: readonly T[], wanted: readonly T[]): T[] {
	const pairs = wanted.flatMap((next, w) =>
		current.flatMap((node, c) => {
			const fit = fitOf(node, next);
			return fit ? [{ w, c, fit }] : [];
		})
	);
	// Best fit first: more shared active views, then more shared views; ties keep the order of
	// `wanted`, then of `current`.
	pairs.sort(
		(x, y) => y.fit.active - x.fit.active || y.fit.views - x.fit.views || x.w - y.w || x.c - y.c
	);
	const matches = new Map<number, T>();
	const taken = new Set<number>();
	for (const { w, c } of pairs) {
		if (matches.has(w) || taken.has(c)) continue;
		matches.set(w, current[c]!);
		taken.add(c);
	}
	return wanted.map((next, w) => {
		const match = matches.get(w);
		if (!match) return next;
		reconcileNode(match, next);
		if (isFloating(match) && isFloating(next) && !sameRect(match.rect, next.rect)) {
			match.rect = next.rect;
		}
		return match;
	});
}

/**
 * How well `node` fits `next`: the active views (the mounted panels) and the views they share,
 * or undefined when they are of different kinds or share no view.
 */
function fitOf(node: NodeConfig, next: NodeConfig): { active: number; views: number } | undefined {
	if (nodeConfigType(node) !== nodeConfigType(next)) return undefined;
	const nextViews = new Set(viewsOf(next));
	const views = viewsOf(node).filter((id) => nextViews.has(id)).length;
	if (views === 0) return undefined;
	const nextActive = new Set(activeViewsOf(next));
	const active = activeViewsOf(node).filter((id) => nextActive.has(id)).length;
	return { active, views };
}

function viewsOf(node: NodeConfig): Id[] {
	if (nodeConfigType(node) === 'tabGroup') return (node as TabGroupConfig).tabs;
	return (node as SplitConfig).views.flatMap(viewsOf);
}

/** The views `node` shows: the active tab of each tab group in it. */
function activeViewsOf(node: NodeConfig): Id[] {
	if (nodeConfigType(node) === 'tabGroup') {
		const group = node as TabGroupConfig;
		const active = group.tabs[group.activeTabIndex];
		return active === undefined ? [] : [active];
	}
	return (node as SplitConfig).views.flatMap(activeViewsOf);
}

function isFloating(node: NodeConfig): node is FloatingGroupConfig {
	return 'rect' in node;
}

function sameRect(a: FloatingRect, b: FloatingRect): boolean {
	return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function reconcileTabGroup(target: TabGroupConfig, source: TabGroupConfig): void {
	if (!sameItems(target.tabs, source.tabs)) target.tabs = source.tabs;
	if (target.activeTabIndex !== source.activeTabIndex) {
		target.activeTabIndex = source.activeTabIndex;
	}
}

function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
	return a.length === b.length && a.every((item, i) => item === b[i]);
}
