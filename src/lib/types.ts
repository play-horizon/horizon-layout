/**
 * The public types of horizon-layout: the serialisable `LayoutConfig` tree (splits, tab groups,
 * floating groups, popouts, the maximized view), the `View` descriptors an app passes in, the
 * keyboard controls and the translations. `index.ts` re-exports every type of this file.
 * @module
 */
import type { Snippet } from 'svelte';

/** A non-empty string used as a stable identifier for a view. */
export type Id<T extends string = string> = T extends '' ? never : T;

/** Whether a split lays its children side by side (`horizontal`) or stacked (`vertical`). */
export type SplitDirection = 'horizontal' | 'vertical';

/** Everything HorizonLayout needs to know about a single panel's content. */
export interface View {
	/**
	 * The tab's label, the popout window's title, and the accessible name of the maximized view
	 * and (through `translations.floatingPanel`) of the floating group showing it.
	 */
	title: string;
	/** The panel body, rendered inside the active tab's content area. */
	snippet: Snippet;
	/**
	 * Controls rendered inside the tab, to the right of the title (for example a close button or
	 * a badge), each given the view's id.
	 */
	tabControls?: Snippet<[Id]>[];
}

/** A node that splits its space among two or more children. */
export interface SplitConfig {
	direction: SplitDirection;
	/** The children, from left to right or top to bottom; at least two. */
	views: [NodeConfig, NodeConfig, ...NodeConfig[]];
	/**
	 * One split point per gap between views (`views.length - 1` of them), in increasing order:
	 * each is where the gap is, as a fraction from 0 to 1 of the split's width or height.
	 */
	splitPoints: [number, ...number[]];
}

/** A node that holds one or more tabs and shows one at a time. */
export interface TabGroupConfig {
	/** The views of the tabs, in order; at least one. */
	tabs: [Id, ...Id[]];
	/** The index in `tabs` of the tab shown. */
	activeTabIndex: number;
}

/** A node of the docked layout's tree: a split or a tab group (see `nodeConfigType`). */
export type NodeConfig = SplitConfig | TabGroupConfig;

/** A width and a height, in CSS pixels. */
export interface Size {
	width: number;
	height: number;
}

/**
 * Where a floating group is, in CSS pixels from the layout's top-left corner. It is shown moved
 * and shrunk to fit inside the layout when the layout is smaller (the stored value is kept), and
 * at least `FLOATING_MIN_WIDTH` by `FLOATING_MIN_HEIGHT`.
 */
export interface FloatingRect extends Size {
	x: number;
	y: number;
}

/**
 * A tab group floating above the docked layout, inside its box: moved by its tab bar, resized by
 * its edges, and docked back by dragging its tabs (or with the keyboard).
 */
export interface FloatingGroupConfig extends TabGroupConfig {
	rect: FloatingRect;
}

/**
 * The whole state of a layout, a plain serialisable object: bind it to `HorizonLayout`, persist
 * it, and read it back with `parseLayoutConfig`. A view is shown in one place at most: one tab,
 * docked or floating, or one popout.
 */
export interface LayoutConfig {
	/** The docked layout; absent for an empty one. */
	root?: NodeConfig;
	/** Tab groups floating above the docked layout, from the bottom one to the top one. */
	floating?: FloatingGroupConfig[];
	/** When set, this view fills the entire layout, hiding everything else. */
	maximizedView?: Id;
	/**
	 * Views rendered in their own browser windows. HorizonLayout opens and closes the windows as
	 * this array changes.
	 */
	popouts?: Id[];
}

/**
 * The modifier keys a shortcut needs, all of them and no other: a shortcut without a modifier
 * only matches a key pressed with none of Ctrl, Alt and Shift. No shortcut matches a key pressed
 * with Meta (Command): those belong to the browser and the system.
 */
export type Modifier =
	| 'ctrl'
	| 'alt'
	| 'shift'
	| 'ctrl+alt'
	| 'ctrl+shift'
	| 'alt+shift'
	| 'ctrl+alt+shift';

/** A key combination. */
export interface KeyboardShortcut {
	/** The modifiers held; none when absent. */
	modifier?: Modifier;
	/** The `KeyboardEvent.key` value, for example `ArrowLeft` or `w` (`W` with Shift). */
	key: string;
}

/**
 * A single action triggered by one or more equivalent key combinations. The first control of a
 * category with a matching shortcut runs; the key's default action and propagation are stopped.
 */
export interface KeyboardControl<T> {
	shortcuts: KeyboardShortcut[];
	/** Runs the control on `data`, the element it is for, which it may change in place. */
	action: (data: T, event: KeyboardEvent) => void;
}

/**
 * What a floating group's keyboard controls act on: the group, and the size of the layout it
 * floats in (zero until the layout is measured), to keep it inside.
 */
export interface FloatingControlData {
	config: FloatingGroupConfig;
	bounds: Size;
}

/**
 * Controls passed to HorizonLayout. Every array is optional: one given replaces the built-in
 * controls of its category, one left out keeps them.
 */
export interface KeyboardControls {
	/** Run on a focused split handle, given the split and the index of its split point. */
	splitControls?: KeyboardControl<{ config: SplitConfig; index: number }>[];
	/** Run on a focused tab list, docked or floating. */
	tabGroupControls?: KeyboardControl<TabGroupConfig>[];
	/** Run on a focused floating group's frame (not on its tab list or its content). */
	floatingControls?: KeyboardControl<FloatingControlData>[];
}

/**
 * The text HorizonLayout writes itself. Its `translations` prop takes any of these keys, each one
 * left out being the English text of `englishTranslations`; an app that translates its interface
 * passes them all.
 */
export interface LayoutTranslations {
	/**
	 * Accessible name of the handle between two panes of a split, given the 1-based number of the
	 * pane before the handle (for example "Resize pane 1").
	 */
	resizePane: (pane: number) => string;
	/**
	 * Accessible name of a floating group's frame, given the title of its active tab (for example
	 * "Docs, floating panel").
	 */
	floatingPanel: (title: string) => string;
	/**
	 * Accessible name of a tab group's tab list, given the title of its active tab (for example
	 * "Tabs, Files shown").
	 */
	tabList: (title: string) => string;
}

/** Where a node sits in the docked tree: the split holding it and its index in `views`. */
export type ParentEntry = { parent: SplitConfig; index: number };
