/**
 * Lookups in a docked layout tree shared by the demo's page list, its keyboard actions and its
 * constraint fields.
 * @module
 */
import type { NodeConfig, SplitConfig, TabGroupConfig } from '#lib/types.js';
import { nodeConfigType } from '#lib/utils.js';

/** The first tab group of `node` in reading order: the top-left one. */
export function firstTabGroup(node: NodeConfig): TabGroupConfig {
	if (nodeConfigType(node) === 'tabGroup') return node as TabGroupConfig;
	return firstTabGroup((node as SplitConfig).views[0]);
}

/** The last tab group of `node` in reading order: the bottom-right one. */
export function lastTabGroup(node: NodeConfig): TabGroupConfig {
	if (nodeConfigType(node) === 'tabGroup') return node as TabGroupConfig;
	const views = (node as SplitConfig).views;
	return lastTabGroup(views[views.length - 1]!);
}

/** How deep `node` nests, counted in tab groups as `maxDepth` counts it (a lone tab group is 1). */
export function depthOf(node: NodeConfig): number {
	if (nodeConfigType(node) === 'tabGroup') return 1;
	return 1 + Math.max(...(node as SplitConfig).views.map(depthOf));
}
