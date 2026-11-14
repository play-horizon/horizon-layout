/**
 * The demo's "Dock in the layout" button, as an app writes one with the library's API: it docks
 * a floating group's tabs at the end of the docked layout, through the bound config, then moves
 * the focus to the tab list that holds them. The keys of a floating group's tab list (Ctrl + End)
 * dock its active tab only; the button docks the whole group, for the pointer, and for a screen
 * reader that lists the group's buttons.
 * @module
 */
import { tick } from 'svelte';
import type { FloatingGroupConfig, Id, LayoutConfig } from '#lib/types.js';
import { lastTabGroup } from './layout-tree.js';

/** The floating group showing view `id` in `config`, if it floats. */
export function floatingGroupOf(config: LayoutConfig, id: Id): FloatingGroupConfig | undefined {
	return config.floating?.find((floating) => floating.tabs.includes(id));
}

/**
 * Moves the tabs of floating group `group` to the end of the last docked tab group of `config`,
 * in place, or makes them the docked layout when nothing is docked; the group's active tab stays
 * active.
 */
export function dockAtEnd(config: LayoutConfig, group: FloatingGroupConfig): void {
	const remaining = (config.floating ?? []).filter((floating) => floating !== group);
	config.floating = remaining.length > 0 ? remaining : undefined;
	if (!config.root) {
		config.root = { tabs: group.tabs, activeTabIndex: group.activeTabIndex };
		return;
	}
	const target = lastTabGroup(config.root);
	const start = target.tabs.length;
	target.tabs.push(...group.tabs);
	target.activeTabIndex = start + group.activeTabIndex;
}

/**
 * Focuses, once the layout has rendered the change, the tab list of `layoutElement` (not of a
 * layout nested in it) that owns the tab titled `title`: the layout's tab lists own their tabs
 * through `aria-owns`. The demo's titles are unique.
 */
export async function focusTabListOf(layoutElement: Element, title: string): Promise<void> {
	await tick();
	const tab = [...layoutElement.querySelectorAll('[role="tab"]')].find(
		(element) =>
			element.textContent === title && element.closest('.horizon-layout') === layoutElement
	);
	if (!tab) return;
	layoutElement
		.querySelector<HTMLElement>(`[role="tablist"][aria-owns~="${CSS.escape(tab.id)}"]`)
		?.focus();
}
