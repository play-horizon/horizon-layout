/**
 * The demo's popout bookkeeping: popping a view out of the main layout into its own window, and
 * putting it back where it came from when the user closes that window (`onPopoutClose`). A view
 * that floated floats again at the same place; a docked one goes back beside a view it was next to:
 * into the same tab group, or as a pane of its own on the same side of its neighbour.
 * @module
 */
import type {
	FloatingRect,
	Id,
	LayoutConfig,
	SplitConfig,
	SplitDirection,
	TabGroupConfig
} from '#lib/types.js';
import {
	buildNodeParentMap,
	cloneConfig,
	findTabGroup,
	floatView,
	removeView
} from '#lib/utils.js';
import { firstTabGroup, lastTabGroup } from './layout-tree.js';

type Origin =
	| { kind: 'floating'; rect: FloatingRect }
	// One of the tabs of the group that also shows `beside`, at `index`.
	| { kind: 'tab'; beside: Id; index: number }
	// A pane of its own in a split along `direction`, on `side` of the pane showing `beside`.
	| { kind: 'pane'; beside: Id; direction: SplitDirection; side: 'before' | 'after' }
	// The whole docked layout.
	| { kind: 'root' };

/** Where each popped-out view of one layout goes back to. */
export class PopoutOrigins {
	readonly #origins = new Map<Id, Origin>();

	/**
	 * Moves the view `id` out of `config`, in place, into `config.popouts`, and remembers where it
	 * was. Does nothing for a view that is already popped out or isn't in a tab group.
	 */
	popOut(config: LayoutConfig, id: Id): void {
		if (config.popouts?.includes(id)) return;
		const origin = originOf(config, id);
		if (!origin) return;
		removeView(config, id);
		config.popouts = [...(config.popouts ?? []), id];
		this.#origins.set(id, origin);
	}

	/**
	 * Puts the view `id`, whose popout window was closed, back into `config`, in place, where
	 * `popOut` found it. HorizonLayout calls `onPopoutClose` after taking the id out of its own
	 * copy of the config, before the bound `config` catches up, so `config.popouts` may still
	 * list it: it is taken out here. A pane of its own is made only when `isValid` accepts the
	 * result (the neighbour it halves may get smaller than the minimum size); otherwise the view
	 * becomes a tab of its neighbour's group. With no neighbour left, it becomes the last tab of
	 * the docked layout.
	 */
	restore(config: LayoutConfig, id: Id, isValid: (candidate: LayoutConfig) => boolean): void {
		const origin = this.#origins.get(id) ?? { kind: 'root' };
		this.#origins.delete(id);
		removeView(config, id);
		switch (origin.kind) {
			case 'floating':
				floatView(config, id, origin.rect);
				return;
			case 'tab': {
				const group = findTabGroup(config, origin.beside);
				if (group) insertTab(group, id, origin.index);
				else appendToLayout(config, id);
				return;
			}
			case 'pane': {
				const candidate = cloneConfig(config);
				if (splitBeside(candidate, id, origin) && isValid(candidate)) {
					splitBeside(config, id, origin);
					return;
				}
				const group = findTabGroup(config, origin.beside);
				if (group) insertTab(group, id, group.tabs.length);
				else appendToLayout(config, id);
				return;
			}
			case 'root':
				appendToLayout(config, id);
				return;
		}
	}

	/** Forgets every remembered origin, for a layout that starts over. */
	clear(): void {
		this.#origins.clear();
	}
}

function originOf(config: LayoutConfig, id: Id): Origin | undefined {
	const floating = config.floating?.find((group) => group.tabs.includes(id));
	if (floating) return { kind: 'floating', rect: { ...floating.rect } };
	const group = findTabGroup(config, id);
	if (!group || !config.root) return undefined;
	const beside = group.tabs.find((tab) => tab !== id);
	if (beside !== undefined) return { kind: 'tab', beside, index: group.tabs.indexOf(id) };
	const entry = buildNodeParentMap(config.root).get(group);
	if (!entry) return { kind: 'root' };
	// The neighbour is the pane before, or the one after for a first pane; the view in it nearest
	// to the popped-out pane stands for it.
	const isFirst = entry.index === 0;
	const neighbour = entry.parent.views[entry.index + (isFirst ? 1 : -1)]!;
	const nearest = isFirst ? firstTabGroup(neighbour) : lastTabGroup(neighbour);
	return {
		kind: 'pane',
		beside: nearest.tabs[nearest.activeTabIndex] ?? nearest.tabs[0],
		direction: entry.parent.direction,
		side: isFirst ? 'before' : 'after'
	};
}

function insertTab(group: TabGroupConfig, id: Id, index: number): void {
	const at = Math.min(index, group.tabs.length);
	group.tabs.splice(at, 0, id);
	group.activeTabIndex = at;
}

function appendToLayout(config: LayoutConfig, id: Id): void {
	if (!config.root) {
		config.root = { tabs: [id], activeTabIndex: 0 };
		return;
	}
	const group = lastTabGroup(config.root);
	insertTab(group, id, group.tabs.length);
}

// Splits the docked group showing `origin.beside` to give `id` a pane of its own on
// `origin.side`, halving the neighbour; false when that group isn't docked any more.
function splitBeside(
	config: LayoutConfig,
	id: Id,
	origin: { beside: Id; direction: SplitDirection; side: 'before' | 'after' }
): boolean {
	const group = findTabGroup(config, origin.beside);
	if (!group || !config.root || config.floating?.some((floating) => floating === group)) {
		return false;
	}
	const pane: TabGroupConfig = { tabs: [id], activeTabIndex: 0 };
	const isAfter = origin.side === 'after';
	const entry = buildNodeParentMap(config.root).get(group);
	if (entry?.parent.direction === origin.direction) {
		const { parent, index } = entry;
		const start = parent.splitPoints[index - 1] ?? 0;
		const end = parent.splitPoints[index] ?? 1;
		parent.views.splice(index + (isAfter ? 1 : 0), 0, pane);
		parent.splitPoints.splice(index, 0, Number(((start + end) / 2).toFixed(4)));
		return true;
	}
	const split: SplitConfig = {
		direction: origin.direction,
		views: isAfter ? [group, pane] : [pane, group],
		splitPoints: [0.5]
	};
	if (entry) entry.parent.views[entry.index] = split;
	else config.root = split;
	return true;
}
