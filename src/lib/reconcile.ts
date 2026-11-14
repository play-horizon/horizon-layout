/**
 * Applies a new layout config onto the one HorizonLayout renders, in place: every node whose place
 * in the tree and kind are unchanged stays the same object, so the components rendering it, and
 * the views they show, stay mounted. Internal to the library.
 * @module
 */
import type { LayoutConfig, NodeConfig, SplitConfig, TabGroupConfig } from './types.ts';
import { cloneConfig, nodeConfigType } from './utils.ts';

/// Makes `target` equal to `source` (as `areConfigsEquivalent` sees it), changing `target` in
/// place and keeping its node objects wherever `source` has a node of the same kind at the same
/// place. `source` is only read; nothing of it ends up shared with `target`.
export function reconcileConfig(target: LayoutConfig, source: LayoutConfig): void {
	const copy = cloneConfig(source);

	if (target.root && copy.root && nodeConfigType(target.root) === nodeConfigType(copy.root)) {
		reconcileNode(target.root, copy.root);
	} else if (target.root !== copy.root) {
		target.root = copy.root;
	}
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
	for (let i = 0; i < next.views.length; i++) {
		const current = split.views[i];
		const wanted = next.views[i]!;
		if (current && nodeConfigType(current) === nodeConfigType(wanted)) {
			reconcileNode(current, wanted);
		} else {
			split.views[i] = wanted;
		}
	}
	if (split.views.length > next.views.length) split.views.length = next.views.length;
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
