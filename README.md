# HorizonLayout

<div align="center">
	<a href="https://www.npmjs.com/package/horizon-layout">
		<img src="https://img.shields.io/npm/v/horizon-layout.svg" alt="npm version" />
	</a>
	<a href="https://www.npmjs.com/package/horizon-layout">
		<img src="https://img.shields.io/npm/l/horizon-layout.svg" alt="npm license" />
	</a>
</div>

### A headless, fully keyboard-accessible docking layout for Svelte 5. Users can drag tabs between panes, resize splits, float panels inside the window, and pop views out into separate browser windows, all described by a plain serialisable config object that you bind to and persist however you like.

---

## Installation

Install the package from npm:

```sh
npm install horizon-layout
```

Requires Svelte 5.29 or later (the version that added `{@attach}`) as a peer dependency.

---

## Quick start

```svelte
<script lang="ts">
	import { HorizonLayout } from 'horizon-layout';
	import 'horizon-layout/horizon-layout.css'; // the default theme, see Styling
	import { SvelteMap } from 'svelte/reactivity';
	import type { LayoutConfig } from 'horizon-layout';

	const views = new SvelteMap([
		['editor', { title: 'Editor', snippet: editorSnippet }],
		['preview', { title: 'Preview', snippet: previewSnippet }]
	]);

	let config = $state<LayoutConfig>({
		root: {
			direction: 'horizontal',
			views: [
				{ tabs: ['editor'], activeTabIndex: 0 },
				{ tabs: ['preview'], activeTabIndex: 0 }
			],
			splitPoints: [0.5]
		}
	});
</script>

{#snippet editorSnippet()}<MyEditor />{/snippet}
{#snippet previewSnippet()}<MyPreview />{/snippet}

<HorizonLayout bind:config {views} />
```

The layout's own text (accessible names) is English unless you pass `translations` (see
[Translations](#translations)).

---

## `LayoutConfig`

The entire layout state is a plain `LayoutConfig` object. Bind it to keep it in sync, or persist it to `localStorage`/a server.

```ts
interface LayoutConfig {
	root?: NodeConfig; // omit (or set to undefined) to render an empty layout
	floating?: FloatingGroupConfig[]; // tab groups floating over the layout, bottom to top
	maximizedView?: Id; // when set, this view fills the whole container
	popouts?: Id[]; // views opened in their own browser windows
}
```

A view is shown in one place only: one tab (docked or floating) or one popout. `validateConfig`
rejects a config that names a view twice, or that maximizes a view that is in a popout.

HorizonLayout validates every `config` it is given (see [`validateConfig`](#validateconfig)). An
invalid one renders an empty layout and logs the problem with `console.error`, and the bound
`config` is left as it is.

### `NodeConfig`

A node is either a **split** or a **tab group**.

#### `SplitConfig`

```ts
interface SplitConfig {
	direction: 'horizontal' | 'vertical';
	views: [NodeConfig, NodeConfig, ...NodeConfig[]]; // at least two children
	splitPoints: [number, ...number[]]; // length === views.length - 1
}
```

`splitPoints` are fractions `[0, 1]` of the container's width (`horizontal`) or height (`vertical`). For example, `[0.33, 0.66]` divides the container into three equal thirds. They are kept at 4 decimals: HorizonLayout rounds the split points it is given, and the bound `config` gets them back rounded.

#### `TabGroupConfig`

```ts
interface TabGroupConfig {
	tabs: [Id, ...Id[]]; // at least one tab
	activeTabIndex: number;
}
```

#### `FloatingGroupConfig`

```ts
interface FloatingGroupConfig extends TabGroupConfig {
	rect: { x: number; y: number; width: number; height: number }; // CSS pixels
}
```

A tab group floating over the docked layout; see [Floating panels](#floating-panels).

---

## `View`

```ts
interface View {
	title: string;
	snippet: Snippet; // panel body
	tabControls?: Snippet<[Id]>[]; // optional controls shown in the tab, receives the viewId as argument
}
```

A tab's controls are shown in the tab, after its title, and are their own group of buttons for
assistive technologies, named by the tab's title (a screen reader reads "Files, group, Close,
button"), reached with Tab after the tab list. Give each one a name, for example
`aria-label="Close"`. They aren't inside the tab element: a tab's children are presentational, and
a tab list may own tabs only, so the tab list owns its tabs through `aria-owns` and the controls sit
beside them (see [CSS classes](#css-classes)).

Pass views as a `SvelteMap<Id, View>`. The map is reactive: adding or removing a view validates
the config again, so take a view out of `config` (with `removeView`) before, or in the same
update as, deleting it from the map; a config still showing a deleted view is invalid.

---

## `HorizonLayout` props

| Prop                  | Type                          | Default               | Description                                                                                                                                                                    |
| --------------------- | ----------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config`              | `LayoutConfig`                | _(required)_          | Bindable layout state. Its split points are written back rounded to 4 decimals.                                                                                                |
| `views`               | `SvelteMap<Id, View>`         | _(required)_          | Map from view id to its descriptor.                                                                                                                                            |
| `translations`        | `Partial<LayoutTranslations>` | `englishTranslations` | The text the layout writes itself, in your app's language; each key left out is English (see [Translations](#translations)). Apps that translate pass every key.               |
| `tabgroupControls`    | `Snippet<[Id]>[]`             | `[]`                  | Snippets rendered in every tab-group toolbar (receives active viewId).                                                                                                         |
| `disableResizeSplits` | `boolean`                     | `false`               | Stop the pointer from resizing splits. The keyboard still resizes them (see below).                                                                                            |
| `disableDragAndDrop`  | `boolean`                     | `false`               | Prevent tab drag-and-drop.                                                                                                                                                     |
| `showSplitRatio`      | `boolean`                     | `false`               | Show the current split ratio as a label while resizing.                                                                                                                        |
| `minWidthRatio`       | `number`                      | `0.1`                 | Minimum pane width as a fraction of its split container, from 0 to 0.5.                                                                                                        |
| `minHeightRatio`      | `number`                      | `0.2`                 | Minimum pane height as a fraction of its split container, from 0 to 0.5.                                                                                                       |
| `maxDepth`            | `number`                      | `6`                   | How deep the docked layout may nest, an integer of at least 1, counted in tab groups (a split of tab groups is 2 deep). A config deeper is invalid.                            |
| `hideTabBar`          | `boolean`                     | `false`               | Hide the tab bar.                                                                                                                                                              |
| `keyboardControls`    | `KeyboardControls`            | _(see below)_         | Override built-in keyboard shortcuts.                                                                                                                                          |
| `formatRatio`         | `(n: number) => string`       | `"50.00%"`            | Format a split ratio for display.                                                                                                                                              |
| `formatRatioForAria`  | `(n: number) => number`       | `50.00`               | Format a split ratio for `aria-valuenow`.                                                                                                                                      |
| `onPopoutClose`       | `(id: Id) => void`            | —                     | Called when the user closes a popout window, once `config.popouts` no longer lists it.                                                                                         |
| `onPopoutBlocked`     | `(id: Id) => void`            | —                     | Called when the browser blocks a popout after the fallback timeout, once `config.popouts` no longer lists it. If omitted, the tab is moved into the main layout automatically. |
| `baseClass`           | `string`                      | `"horizon-layout"`    | Root CSS class and BEM prefix for all generated elements.                                                                                                                      |
| `skipValidation`      | `boolean`                     | `false`               | Skip config validation on every update (use after pre-validating with `validateConfig`).                                                                                       |

`disableResizeSplits` stops the pointer only: the split handles stay focusable and the
[resizer keys](#resizer-roleseparator) still move them. To stop the keyboard too, pass
`keyboardControls` with the `splitControls` you want kept, for example only `Escape`:

```ts
const keyboardControls: KeyboardControls = {
	splitControls: [
		{
			shortcuts: [{ key: 'Escape' }],
			action: (_, event) => (event.currentTarget as HTMLElement).blur()
		}
	]
};
```

`hideTabBar` never hides a floating group's tab bar: it is what moves the group. `minWidthRatio`
and `minHeightRatio` are taken at the precision split points are stored with (4 decimals).

---

## Translations

The text HorizonLayout writes itself (accessible names) comes from the
`translations` prop. The prop is optional: every key it leaves out, or the whole prop, falls back
to the English text exported as `englishTranslations`, so a layout with no translations works in
English. An app that translates its interface passes every key, from its i18n layer, so no English
is left in another language:

```svelte
<HorizonLayout
	bind:config
	{views}
	translations={{
		resizePane: (pane) => m.resizePane({ pane }),
		floatingPanel: (title) => m.floatingPanel({ title }),
		tabList: (title) => m.tabList({ title })
	}}
/>
```

The keys, with their English default:

```ts
interface LayoutTranslations {
	// Accessible name of the handle between two panes of a split, given the 1-based number of the
	// pane before the handle: "Resize pane 1".
	resizePane: (pane: number) => string;
	// Accessible name of a floating group's frame, given the title of its active tab:
	// "Docs, floating panel".
	floatingPanel: (title: string) => string;
	// Accessible name of a tab group's tab list, given the title of its active tab:
	// "Tabs, Files shown".
	tabList: (title: string) => string;
}
```

---

## Styling

HorizonLayout renders plain elements with BEM classes (below) and sets inline only the styles its
logic depends on:

- the root's `position: relative`, and the splits' flex layout and pane sizes;
- the stacking of the docked layout and of the floating layer (`isolation: isolate`), the floating
  layer's `position: absolute; inset: 0; pointer-events: none`, and each floating group's place,
  size, `z-index` and `pointer-events: auto`, and its resize handles;
- `touch-action: none` on the split handles, and on a floating group's tab bar and edges;
- the tab list, kept out of sight (it owns the tabs and takes the focus).

Everything else comes from a stylesheet: import the package's default theme,

```ts
import 'horizon-layout/horizon-layout.css';
```

or write your own for the classes below. The default theme holds both the structure a layout
needs (pane overflow, the resizer handles' hit areas, the drop zones) and its look, and styles the
default `baseClass` only. Its colours and sizes are CSS custom properties set on `:root` (dark
values) and on `.light` (light values, applied inside any element with the `light` class);
override them to restyle it:

| Variable                                     | Used for                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `--hl-background`, `--hl-foreground`         | The layout's and the popouts' background and text, the tab bars         |
| `--hl-card`                                  | Tab groups and their content                                            |
| `--hl-secondary`, `--hl-accent`              | The active tab, and the active tab of a focused tab list                |
| `--hl-tab-inactive-color`                    | The titles of inactive tabs                                             |
| `--hl-muted-foreground`                      | The title of a hovered tab                                              |
| `--hl-border`                                | Borders                                                                 |
| `--hl-primary`                               | Resizer handles, the split ratio label's text, the tab insertion marker |
| `--hl-ring`                                  | Focus outlines                                                          |
| `--hl-popover`, `--hl-glass-blur`            | The split ratio label's background and its backdrop blur                |
| `--hl-drop-hint-border`, `--hl-drop-hint-bg` | The hint of the pane a dragged tab would split                          |
| `--hl-floating-shadow`                       | A floating group's shadow                                               |
| `--hl-radius`                                | The corner radius of tabs, drop hints and floating groups               |

The default theme draws every edge once, so two panes meet on a single 1px line: a docked tab
group has only its right and bottom borders (the lines to its neighbours, or the layout's own
edges), and the docked layout's wrapper (`.horizon-layout__content--docked`) the left and top
ones. A floating group's tab group has its full border. A theme that gives every group a full
border instead shows two lines side by side where panes meet.

## CSS classes

All elements receive BEM classes derived from `baseClass` (`"horizon-layout"` by default).

| Class                                                              | Element                                                                                                                                                                                            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.horizon-layout`                                                  | Root container                                                                                                                                                                                     |
| `.horizon-layout__content`                                         | Content wrapper (or maximised view wrapper)                                                                                                                                                        |
| `.horizon-layout__content--maximized`                              | Added when a view is maximised                                                                                                                                                                     |
| `.horizon-layout__content--docked`                                 | The docked layout's wrapper (draws its left and top border)                                                                                                                                        |
| `.horizon-layout__popout`                                          | Popout window root element                                                                                                                                                                         |
| `.horizon-layout__floating`                                        | Layer holding the floating groups, over the docked layout                                                                                                                                          |
| `.horizon-layout-floating`                                         | A floating group's frame (holds a `.horizon-layout-tabgroup`)                                                                                                                                      |
| `.horizon-layout-floating--focused`                                | Added while focus is inside the floating group                                                                                                                                                     |
| `.horizon-layout-floating__resizer`                                | A pointer handle on an edge or corner of a floating group                                                                                                                                          |
| `.horizon-layout-floating__resizer--n/ne/e/se/s/sw/w/nw`           | The handle's edge or corner                                                                                                                                                                        |
| `.horizon-layout-split`                                            | A split container                                                                                                                                                                                  |
| `.horizon-layout-split--horizontal` / `--vertical`                 | Direction modifier                                                                                                                                                                                 |
| `.horizon-layout-split__pane`                                      | Individual pane inside a split                                                                                                                                                                     |
| `.horizon-layout-split__pane--horizontal` / `--vertical`           | Direction modifier on each pane                                                                                                                                                                    |
| `.horizon-layout-split__resizer`                                   | Drag handle between panes                                                                                                                                                                          |
| `.horizon-layout-split__resizer--horizontal` / `--vertical`        | Direction modifier on resizer container                                                                                                                                                            |
| `.horizon-layout-split__resizer--active`                           | Added while the resizer is focused/dragged                                                                                                                                                         |
| `.horizon-layout-split__resizer-handle`                            | Focusable window splitter (`role="separator"`) in the resizer                                                                                                                                      |
| `.horizon-layout-split__resizer-handle--horizontal` / `--vertical` | Direction modifier on handle                                                                                                                                                                       |
| `.horizon-layout-split__resizer-handle--active`                    | Added while the resizer is focused/dragged                                                                                                                                                         |
| `.horizon-layout-split__ratio`                                     | Floating ratio label (visible when `showSplitRatio`)                                                                                                                                               |
| `.horizon-layout-split__ratio--horizontal` / `--vertical`          | Direction modifier on ratio label                                                                                                                                                                  |
| `.horizon-layout-split__ratio--active`                             | Added while the matching resizer is active                                                                                                                                                         |
| `.horizon-layout-tabgroup`                                         | A tab group (`<section>`)                                                                                                                                                                          |
| `.horizon-layout-tabgroup__tab-bar`                                | Tab bar row                                                                                                                                                                                        |
| `.horizon-layout-tabgroup__tablist`                                | Tab list (`role="tablist"`), out of sight: it owns the tabs, takes the focus, and its focus ring is drawn on the active tab                                                                        |
| `.horizon-layout-tabgroup__tabs`                                   | The strip of tabs as laid out, with their controls, the drop hints and the tab list. Keep it unpositioned: the out-of-sight tab list is placed against the tab bar, outside what the strip scrolls |
| `.horizon-layout-tabgroup__tab`                                    | A tab as seen: its title and its controls                                                                                                                                                          |
| `.horizon-layout-tabgroup__tab--active`                            | Active tab modifier                                                                                                                                                                                |
| `.horizon-layout-tabgroup__tab-title`                              | The tab itself (`role="tab"`), its title                                                                                                                                                           |
| `.horizon-layout-tabgroup__tab-controls`                           | The tab's controls (`role="group"`, named by the tab)                                                                                                                                              |
| `.horizon-layout-tabgroup__tab-control`                            | Individual per-tab control wrapper                                                                                                                                                                 |
| `.horizon-layout-tabgroup__tab-drop-hint`                          | Visible insertion marker before/between/after tabs                                                                                                                                                 |
| `.horizon-layout-tabgroup__tab-drop-hint--{n}`                     | Numeric index modifier (0 … tabs.length)                                                                                                                                                           |
| `.horizon-layout-tabgroup__tab-drop-hint--end`                     | Modifier for the trailing insertion marker                                                                                                                                                         |
| `.horizon-layout-tabgroup__tab-drop-hint--hover`                   | Added when a tab insertion marker is active                                                                                                                                                        |
| `.horizon-layout-tabgroup__tab-drop-zone`                          | Invisible tab insertion hit target                                                                                                                                                                 |
| `.horizon-layout-tabgroup__tab-drop-zone--{n}`                     | Numeric index modifier (0 … tabs.length)                                                                                                                                                           |
| `.horizon-layout-tabgroup__tab-drop-zone--end`                     | Modifier for the trailing hit target                                                                                                                                                               |
| `.horizon-layout-tabgroup__controls`                               | Container for shared tab-group snippets                                                                                                                                                            |
| `.horizon-layout-tabgroup__control`                                | Individual shared control wrapper                                                                                                                                                                  |
| `.horizon-layout-tabgroup__body`                                   | Content + drop-zone wrapper                                                                                                                                                                        |
| `.horizon-layout-tabgroup__content`                                | Active view content area                                                                                                                                                                           |
| `.horizon-layout-tabgroup__drop-zones`                             | Drop-zone overlay (visible during drag)                                                                                                                                                            |
| `.horizon-layout-tabgroup__drop-hint`                              | Visible pane split hint for the active drop side                                                                                                                                                   |
| `.horizon-layout-tabgroup__drop-hint--top/right/bottom/left`       | Drop hint side modifier                                                                                                                                                                            |
| `.horizon-layout-tabgroup__drop-zone`                              | Invisible pane split hit target                                                                                                                                                                    |
| `.horizon-layout-tabgroup__drop-zone--top/right/bottom/left`       | Drop-zone side modifier                                                                                                                                                                            |

---

## Keyboard shortcuts

### Resizer (`role="separator"`)

Each handle between two panes is a [WAI-ARIA window splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/):
a focusable `separator` named by `translations.resizePane`, oriented as the handle itself is
(`vertical` between panes side by side), controlling the pane before it (`aria-controls`), with its
position in the split as its value (`aria-valuenow`, from `formatRatioForAria`, between
`aria-valuemin` and `aria-valuemax`, the positions the minimum pane sizes allow, and
`aria-valuetext` from `formatRatio`).

| Keys          | Action                             |
| ------------- | ---------------------------------- |
| `←` / `↑`     | Move resizer −1 %                  |
| `→` / `↓`     | Move resizer +1 %                  |
| `Shift + ←/↑` | Move −10 %                         |
| `Shift + →/↓` | Move +10 %                         |
| `Ctrl + ←/↑`  | Move −0.1 %                        |
| `Ctrl + →/↓`  | Move +0.1 %                        |
| `Alt + ←/↑`   | Move −0.01 %                       |
| `Alt + →/↓`   | Move +0.01 %                       |
| `Home`        | Snap to the minimum valid position |
| `End`         | Snap to the maximum valid position |
| `Escape`      | Unselect/Blur the resizer          |

### Tab group (`role="tablist"`)

| Keys               | Action                                                 |
| ------------------ | ------------------------------------------------------ |
| `←` / `↑`          | Previous tab                                           |
| `→` / `↓`          | Next tab                                               |
| `Home` / `End`     | First / last tab                                       |
| `Shift + ←/↑`      | Move active tab left/up within group                   |
| `Shift + →/↓`      | Move active tab right/down within group                |
| `Shift + Home/End` | Move active tab to start/end of group                  |
| `Ctrl + ←/↑/→/↓`   | Move active tab to the nearest group in that direction |
| `Ctrl + Home/End`  | Move active tab to the first/last group                |
| `Alt + ←/↑/→/↓`    | Split active tab out into a new pane in that direction |
| `Escape`           | Unselect/Blur the tab list                             |

The keys work on the focused tab list itself: keys pressed in a tab's controls (a close button, a
text field) are left to them. A docked group's active tab is split out only when the group has two
tabs or more.

In a floating group's tab list, the moves between groups dock the active tab instead:
`Ctrl + ←/↑/→/↓` moves it into the docked group on that side of the layout, `Alt + ←/↑/→/↓` makes
it a new pane on that side of the layout, and `Ctrl + Home/End` moves it into the first/last docked
group (each makes it the whole docked layout when nothing is docked). Focus follows the moved tab.

### Floating group frame (`role="dialog"`)

The keys work on the focused frame itself, not on its tab list or its content.

| Keys                  | Action                         |
| --------------------- | ------------------------------ |
| `←/↑/→/↓`             | Move the group 10 px           |
| `Shift + ←/↑/→/↓`     | Move it 50 px                  |
| `Alt + →/↓`           | Make it 10 px wider/taller     |
| `Alt + ←/↑`           | Make it 10 px narrower/shorter |
| `Alt + Shift + arrow` | Resize it by 50 px             |
| `Escape`              | Blur the frame                 |

Modifiers match exactly: a shortcut without one only runs when none of Ctrl, Alt and Shift is
held. No shortcut runs while Meta (Command) is held: those keys stay the browser's and the
system's. Pass `keyboardControls` to override any subset of these.

---

## Touch screens

Everything the mouse does works with a finger, on iOS Safari (15 and later) and Chrome on Android:

- **Moving a tab**: long press a tab to lift it, then drag it onto a tab bar or the side of a pane,
  as with a mouse. This is the browser's own drag and drop, which starts on a long press on a
  touch screen; a short tap selects the tab. `disableDragAndDrop` turns it off.
- **Resizing a split**: drag the line between two panes (its handle is 12 px wide).
- **Moving a floating group**: drag the empty part of its tab bar; its edges and corners resize it.

Split handles, a floating group's tab bar and its edges set `touch-action: none` themselves, and
the default theme sets it on tabs, so a swipe there moves the tab, the handle or the group instead
of scrolling the page. The default theme also makes tab titles unselectable (`user-select` and
Safari's `-webkit-user-select`), so a long press lifts the tab rather than selecting its text. A
theme of your own keeps `touch-action` and both of those on `.horizon-layout-tabgroup__tab`.

---

## Custom keyboard controls

```ts
import type { KeyboardControls } from 'horizon-layout';

const keyboardControls: KeyboardControls = {
	tabGroupControls: [
		{
			shortcuts: [{ modifier: 'ctrl', key: 'w' }],
			action: (tabGroup) => closeActiveTab(tabGroup)
		}
	]
	// omit splitControls or floatingControls to keep their defaults
};
```

A floating control's action receives `{ config, bounds }`: the floating group and the size of the
layout, which `moveFloatingGroup` and `resizeFloatingGroup` keep the group inside.

Each array given replaces the built-in controls of its category entirely; a category left out keeps its built-in controls.

---

## `parseLayoutConfig`

Parse an unknown value (e.g. from `JSON.parse`) into a typed `LayoutConfig`. Throws a descriptive error if the value does not match the expected shape. Unknown extra fields are ignored.

```ts
import { parseLayoutConfig } from 'horizon-layout';

const raw = localStorage.getItem('layout');
if (raw) {
	try {
		config = parseLayoutConfig(JSON.parse(raw));
	} catch (e) {
		console.warn('Invalid saved layout:', (e as Error).message);
	}
}
```

The error names the faulty field by its path, for example
`config.root.views[0].tabs: expected a non-empty array`. Empty `floating` and `popouts` arrays are
dropped. `parseLayoutConfig` only checks the structure, it does not validate that the config is valid. Run `validateConfig` afterwards if you need that guarantee.

---

## `validateConfig`

Validate a `LayoutConfig` before passing it to `HorizonLayout`. Throws an `Error` describing the first problem found if the config is invalid, and returns nothing. It checks that every id names a view of `views`, that no view is shown twice, that every `activeTabIndex` is the index of a tab, that every split has two views or more and split points that leave each pane its minimum ratio (both taken at 4 decimals, as the layout takes them), that the docked layout nests no deeper than `maxDepth` (counted in tab groups: a split of tab groups is 2 deep), that every floating `rect` has finite numbers and a positive size, and that the maximized view isn't in a popout. The error names the faulty field by its path, for example `config.root.views[1].activeTabIndex: expected an integer from 0 to 2, the index of a tab`, or `config.root.views[0].views[1]: nested 3 deep, deeper than maxDepth (2)`. An option out of its range (a minimum ratio from 0 to 0.5, a `maxDepth` that is an integer of at least 1) is refused the same way, named `options.<name>`.

```ts
import { validateConfig } from 'horizon-layout';

try {
	validateConfig(config, views, {
		minWidthRatio: 0.1, // optional, matches your HorizonLayout prop
		minHeightRatio: 0.2, // optional, matches your HorizonLayout prop
		maxDepth: 4 // optional, matches your HorizonLayout prop
	});
	// safe to pass to HorizonLayout, optionally with skipValidation
} catch (e) {
	console.error((e as Error).message);
}
```

Pass `skipValidation` to `HorizonLayout` once you have confirmed the config is valid, to avoid the redundant re-check on every update:

```svelte
<HorizonLayout bind:config {views} skipValidation />
```

---

## Helpers

Every helper is exported from `horizon-layout`, with a doc comment your editor shows.

| Helper                                                                       | What it does                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `parseLayoutConfig(value)`                                                   | Parses an unknown value into a `LayoutConfig` (see above).                            |
| `validateConfig(config, views, options?)`                                    | Throws when `config` can't be shown (see above).                                      |
| `cloneConfig(config)`                                                        | A deep copy that shares no object with `config`.                                      |
| `areConfigsEquivalent(a, b)`                                                 | Whether two configs describe the same layout (popouts in any order).                  |
| `findTabGroup(config, id)`                                                   | The tab group, docked or floating, that has the view as a tab.                        |
| `floatView(config, id, rect)`, `removeView(config, id)`                      | Float a view, take it out of the layout (see [Floating panels](#floating-panels)).    |
| `nodeConfigType(node)`                                                       | `'split'` or `'tabGroup'`.                                                            |
| `buildNodeParentMap(root)`                                                   | A map from every node under `root` to the split holding it and its index there.       |
| `simplifyTabGroup(group, parents, config)`                                   | Removes an emptied tab group and collapses the splits it leaves with one child.       |
| `moveFloatingGroup(group, dx, dy, bounds)`                                   | Moves a floating group, keeping it inside the layout (for custom `floatingControls`). |
| `resizeFloatingGroup(group, dw, dh, bounds)`                                 | Resizes a floating group from its bottom-right corner, keeping it inside the layout.  |
| `clampFloatingRect(rect, bounds)`, `resizedRect(rect, edge, dx, dy, bounds)` | The rect a floating group is shown at, and a rect resized by one of its edges.        |
| `FLOATING_MIN_WIDTH`, `FLOATING_MIN_HEIGHT`                                  | The smallest size a floating group is shown at (160 × 96 px).                         |

---

## Floating panels

A floating group is a tab group that floats over the docked layout, inside its box. Users move it
by dragging its tab bar, resize it by dragging an edge or a corner, raise it by pressing it, and
dock its tabs back by dragging them onto the layout like any tab (a floating group itself takes
tabs into its tab bar only). From the keyboard, its frame moves and resizes it, and its tab list
docks tabs back (see [Keyboard shortcuts](#keyboard-shortcuts)). A focused floating group is drawn
above the others. Floating groups are part of `config`, so they are saved with the layout, in
stacking order (the last one on top).

`rect` is in CSS pixels from the layout's top-left corner. When the layout is smaller than the
rect, the group is shown moved and shrunk to fit, and the stored rect is kept until the user moves
or resizes the group. A group is never shown smaller than `FLOATING_MIN_WIDTH` ×
`FLOATING_MIN_HEIGHT` (160 × 96 px), unless the layout itself is smaller. Floating groups are
hidden while a view is maximized.

Float a view from your code with `floatView`, which first takes it out of wherever it was:

```ts
import { findTabGroup, floatView } from 'horizon-layout';

// Show the docs: bring their tab to the front if they are open, float them otherwise.
function showDocs() {
	const group = findTabGroup(config, 'docs');
	if (group) group.activeTabIndex = group.tabs.indexOf('docs');
	else floatView(config, 'docs', { x: 80, y: 60, width: 420, height: 520 });
}
```

`removeView(config, id)` takes a view out of the layout (its tab group, `popouts` and
`maximizedView`), removing the groups and splits it leaves empty. `floatView` and `removeView`
change `config` in place; panels that stay in the same split (or float on) stay mounted, even
when panes or floating groups before them come or go.

---

## Popout windows

Add a view id to `config.popouts` and HorizonLayout opens a new browser window with that view's content. The host page's stylesheets, and the theme and language of its `<html>` and `<body>` (their `class`, `lang`, `dir` and `data-*` attributes, and the CSS variables set in their inline style), are mirrored into the window, and followed as they change while it is open: a stylesheet added, changed or removed later, or a theme switched on `<html>` or `<body>`, reaches the window too. Put the theme class on `<html>` or `<body>` for popouts to show it (one on an element inside the page isn't copied). The rest of the page's state stays in the page: the other inline styles of `<body>`, such as the `pointer-events: none` or the scroll lock of an open modal, would freeze the window. Styles set only through the CSSOM (`insertRule`, `adoptedStyleSheets`) leave nothing in the DOM to copy. When the user closes the window, the id is removed from `config.popouts`, then `onPopoutClose` is called, so it can put the view back in the layout. Popout windows close with the page (at its `pagehide`), and when HorizonLayout is unmounted.

```ts
// Open a popout programmatically:
config.popouts = [...(config.popouts ?? []), 'myViewId'];
```

### Blocked popouts

Some browsers (notably Firefox) silently block `window.open` when popups are not permitted by the user. This is particularly relevant when loading a saved config that already contains `popouts` entries — the tab would otherwise be stuck: neither visible in the main layout nor able to open in a new window.

HorizonLayout handles this automatically. If a popout cannot be opened within ~500 ms it is treated as definitively blocked. The default fallback appends the tab to the last tab group in the layout (or creates a new root if the layout is empty), and updates `config` accordingly.

To handle blocked popouts yourself — for example to show a notification or decide where to place the tab — provide `onPopoutBlocked`:

```svelte
<HorizonLayout
	bind:config
	{views}
	onPopoutBlocked={(id) => {
		toast.warning(`"${views.get(id)?.title}" could not open in a new window.`);
		config.root = insertTabSomewhere(config.root, id);
	}}
/>
```

---

## Maximized view

Set `config.maximizedView` to a view id and HorizonLayout fills the whole container with that view. The split layout stays in `config.root` and comes back when the field is cleared. The demo passes a maximize button through `tabgroupControls`. The snippet receives the active view id of that tab group.

```svelte
{#snippet maximizeButton(activeViewId: Id)}
	<button
		onclick={() => (config.maximizedView = activeViewId)}
		title="Maximize"
		aria-label="Maximize"
	>
		Maximize
	</button>
{/snippet}

<HorizonLayout bind:config {views} tabgroupControls={[maximizeButton]} />
```

While a view is maximized, HorizonLayout renders only that view, so the tab-group toolbar is not on screen. The demo restores the layout with a separate button that sets `config.maximizedView = undefined`:

```svelte
{#if config.maximizedView}
	<button class="btn restore" onclick={() => (config.maximizedView = undefined)}>
		Restore layout
	</button>
{/if}
```
