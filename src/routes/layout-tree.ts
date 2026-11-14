/**
 * Lookups in a docked layout tree shared by the demo's page list and its keyboard actions.
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
