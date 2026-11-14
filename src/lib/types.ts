import type { Snippet } from 'svelte';

// A non-empty string used as a stable identifier for a view.
export type Id<T extends string = string> = T extends '' ? never : T;

// Whether a split container lays its children side-by-side or stacked.
export type SplitDirection = 'horizontal' | 'vertical';

// Everything HorizonLayout needs to know about a single panel's content.
export interface View {
	title: string;
	// The panel body. Rendered inside the active tab's content area.
	snippet: Snippet;
	// Optional controls rendered inside the tab, to the right of the title
	// (e.g. a close button or a badge).
	tabControls?: Snippet<[Id]>[];
}

// A node that splits its space among two or more children.
export interface SplitConfig {
	direction: SplitDirection;
	// At least two children are required to form a meaningful split.
	views: [NodeConfig, NodeConfig, ...NodeConfig[]];
	// One split-point per gap between views (length === views.length - 1).
	// Each value is a fraction [0, 1] of the container's width or height.
	splitPoints: [number, ...number[]];
}

// A node that holds one or more tabs and shows one at a time.
export interface TabGroupConfig {
	// At least one tab is required.
	tabs: [Id, ...Id[]];

	// Must be a valid index of the tabs array.
	activeTabIndex: number;
}

export type NodeConfig = SplitConfig | TabGroupConfig;

// A width and a height, in CSS pixels.
export interface Size {
	width: number;
	height: number;
}

// Where a floating group is, in CSS pixels from the layout's top-left corner. It is shown moved
// and shrunk to fit inside the layout when the layout is smaller (the stored value is kept), and
// at least FLOATING_MIN_WIDTH by FLOATING_MIN_HEIGHT.
export interface FloatingRect extends Size {
	x: number;
	y: number;
}

// A tab group floating above the docked layout, inside its box: moved by its tab bar, resized by
// its edges, and docked back by dragging its tabs (or with the keyboard).
export interface FloatingGroupConfig extends TabGroupConfig {
	rect: FloatingRect;
}

export interface LayoutConfig {
	root?: NodeConfig;
	// Tab groups floating above the docked layout, from the bottom one to the top one.
	floating?: FloatingGroupConfig[];
	// When set, this view fills the entire layout container, hiding everything else.
	maximizedView?: Id;
	// Views rendered in detached browser windows. HorizonLayout opens/closes
	// the windows automatically as this array changes.
	popouts?: Id[];
}

export type Modifier =
	| 'ctrl'
	| 'alt'
	| 'shift'
	| 'ctrl+alt'
	| 'ctrl+shift'
	| 'alt+shift'
	| 'ctrl+alt+shift';

export interface KeyboardShortcut {
	modifier?: Modifier;
	key: string;
}

// A single action triggered by one or more equivalent key combinations.
export interface KeyboardControl<T> {
	shortcuts: KeyboardShortcut[];
	action: (data: T, event: KeyboardEvent) => void;
}

// What a floating group's keyboard controls act on: the group, and the size of the layout it
// floats in (zero until the layout is measured), to keep it inside.
export interface FloatingControlData {
	config: FloatingGroupConfig;
	bounds: Size;
}

// Controls passed to HorizonLayout. Every array is optional; omit one
// to keep the built-in defaults for that category.
export interface KeyboardControls {
	splitControls?: KeyboardControl<{ config: SplitConfig; index: number }>[];
	// Run on a focused tab list, docked or floating.
	tabGroupControls?: KeyboardControl<TabGroupConfig>[];
	// Run on a focused floating group's frame (not on its tab list or its content).
	floatingControls?: KeyboardControl<FloatingControlData>[];
}

// The text HorizonLayout writes itself. Its translations prop takes any of these keys, each one
// left out being the English text of englishTranslations; an app that translates its interface
// passes them all.
export interface LayoutTranslations {
	// Accessible name of the handle between two panes of a split, given the 1-based number of
	// the pane before the handle (for example "Resize pane 1").
	resizePane: (pane: number) => string;
	// Accessible name of a floating group's frame, given the title of its active tab (for example
	// "Docs, floating panel").
	floatingPanel: (title: string) => string;
}

// Used internally as an entry in nodeParentMap
export type ParentEntry = { parent: SplitConfig; index: number };
