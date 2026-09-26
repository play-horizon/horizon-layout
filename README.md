# HorizonLayout

<div align="center">
	<a href="https://www.npmjs.com/package/horizon-layout">
		<img src="https://img.shields.io/npm/v/horizon-layout.svg" alt="npm version" />
	</a>
	<a href="https://www.npmjs.com/package/horizon-layout">
		<img src="https://img.shields.io/npm/l/horizon-layout.svg" alt="npm license" />
	</a>
</div>

### A headless, fully keyboard-accessible docking layout for Svelte 5. Users can drag tabs between panes, resize splits, and pop views out into separate browser windows, all described by a plain serialisable config object that you bind to and persist however you like.

---

## Installation

Install the package from npm:

```sh
npm install horizon-layout
```

Requires Svelte 5 as a peer dependency.

---

## Quick start

```svelte
<script lang="ts">
	import { HorizonLayout } from 'horizon-layout';
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

---

## `LayoutConfig`

The entire layout state is a plain `LayoutConfig` object. Bind it to keep it in sync, or persist it to `localStorage`/a server.

```ts
interface LayoutConfig {
	root?: NodeConfig; // omit (or set to undefined) to render an empty layout
	maximizedView?: Id; // when set, this view fills the whole container
	popouts?: Id[]; // views opened in detached browser tabs
}
```

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

`splitPoints` are fractions `[0, 1]` of the container's width (`horizontal`) or height (`vertical`). For example, `[0.33, 0.66]` divides the container into three equal thirds.

#### `TabGroupConfig`

```ts
interface TabGroupConfig {
	tabs: [Id, ...Id[]]; // at least one tab
	activeTabIndex: number;
}
```

---

## `View`

```ts
interface View {
	title: string;
	snippet: Snippet; // panel body
	tabControls?: Snippet<[Id]>[]; // optional controls rendered inside the tab, receives the viewId as argument
}
```

Pass views as a `SvelteMap<Id, View>`. The map is reactive.

---

## `HorizonLayout` props

| Prop                  | Type                    | Default            | Description                                                                                                                          |
| --------------------- | ----------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `config`              | `LayoutConfig`          | _(required)_       | Bindable layout state.                                                                                                               |
| `views`               | `SvelteMap<Id, View>`   | _(required)_       | Map from view id to its descriptor.                                                                                                  |
| `tabgroupControls`    | `Snippet<[Id]>[]`       | `[]`               | Snippets rendered in every tab-group toolbar (receives active viewId).                                                               |
| `disableResizeSplits` | `boolean`               | `false`            | Prevent the user from dragging resizers.                                                                                             |
| `disableDragAndDrop`  | `boolean`               | `false`            | Prevent tab drag-and-drop.                                                                                                           |
| `showSplitRatio`      | `boolean`               | `false`            | Show the current split ratio as a label while resizing.                                                                              |
| `minWidthRatio`       | `number`                | `0.1`              | Minimum pane width as a fraction of its split container.                                                                             |
| `minHeightRatio`      | `number`                | `0.2`              | Minimum pane height as a fraction of its split container.                                                                            |
| `maxDepth`            | `number`                | `6`                | Maximum nesting depth (prevents infinite subdivision).                                                                               |
| `hideTabBar`          | `boolean`               | `false`            | Hide the tab bar.                                                                                                                    |
| `keyboardControls`    | `KeyboardControls`      | _(see below)_      | Override built-in keyboard shortcuts.                                                                                                |
| `formatRatio`         | `(n: number) => string` | `"50.00%"`         | Format a split ratio for display.                                                                                                    |
| `formatRatioForAria`  | `(n: number) => number` | `50.00`            | Format a split ratio for `aria-valuenow`.                                                                                            |
| `onPopoutClose`       | `(id: Id) => void`      | —                  | Called when a popout window is closed by the user.                                                                                   |
| `onPopoutBlocked`     | `(id: Id) => void`      | —                  | Called when the browser blocks a popout after the fallback timeout. If omitted, the tab is moved into the main layout automatically. |
| `baseClass`           | `string`                | `"horizon-layout"` | Root CSS class and BEM prefix for all generated elements.                                                                            |
| `skipValidation`      | `boolean`               | `false`            | Skip config validation on every update (use after pre-validating with `validateConfig`).                                             |

---

## CSS classes

HorizonLayout ships no styles. All elements receive BEM classes derived from `baseClass` (`"horizon-layout"` by default).

| Class                                                              | Element                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `.horizon-layout`                                                  | Root container                                               |
| `.horizon-layout__content`                                         | Content wrapper (or maximised view wrapper)                  |
| `.horizon-layout__content--maximized`                              | Added when a view is maximised                               |
| `.horizon-layout__popout`                                          | Popout window root element                                   |
| `.horizon-layout-split`                                            | A split container                                            |
| `.horizon-layout-split--horizontal` / `--vertical`                 | Direction modifier                                           |
| `.horizon-layout-split__pane`                                      | Individual pane inside a split                               |
| `.horizon-layout-split__pane--horizontal` / `--vertical`           | Direction modifier on each pane                              |
| `.horizon-layout-split__resizer`                                   | Drag handle between panes                                    |
| `.horizon-layout-split__resizer--horizontal` / `--vertical`        | Direction modifier on resizer container                      |
| `.horizon-layout-split__resizer--active`                           | Added while the resizer is focused/dragged                   |
| `.horizon-layout-split__resizer-handle`                            | Focusable slider handle inside the resizer                   |
| `.horizon-layout-split__resizer-handle--horizontal` / `--vertical` | Direction modifier on handle                                 |
| `.horizon-layout-split__resizer-handle--active`                    | Added while dragging                                         |
| `.horizon-layout-split__ratio`                                     | Floating ratio label (visible when `showSplitRatio`)         |
| `.horizon-layout-split__ratio--horizontal` / `--vertical`          | Direction modifier on ratio label                            |
| `.horizon-layout-split__ratio--active`                             | Added while the matching resizer is active                   |
| `.horizon-layout-tabgroup`                                         | A tab group (`<section>`)                                    |
| `.horizon-layout-tabgroup__tab-bar`                                | Tab bar row                                                  |
| `.horizon-layout-tabgroup__tabs`                                   | Tab list (`role="tablist"`)                                  |
| `.horizon-layout-tabgroup__tab`                                    | Individual tab                                               |
| `.horizon-layout-tabgroup__tab--active`                            | Active tab modifier                                          |
| `.horizon-layout-tabgroup__tab--hover`                             | Added on tab hover                                           |
| `.horizon-layout-tabgroup__tab-accent`                             | Colored top accent bar on the active tab                     |
| `.horizon-layout-tabgroup__tab-active-fill`                        | Bottom fill that blends the active tab into the content area |
| `.horizon-layout-tabgroup__tab-title`                              | Tab label text                                               |
| `.horizon-layout-tabgroup__tab-controls`                           | Container for per-tab snippets                               |
| `.horizon-layout-tabgroup__tab-control`                            | Individual per-tab control wrapper                           |
| `.horizon-layout-tabgroup__tab-drop-hint`                          | Visible insertion marker before/between/after tabs           |
| `.horizon-layout-tabgroup__tab-drop-hint--{n}`                     | Numeric index modifier (0 … tabs.length)                     |
| `.horizon-layout-tabgroup__tab-drop-hint--end`                     | Modifier for the trailing insertion marker                   |
| `.horizon-layout-tabgroup__tab-drop-hint--hover`                   | Added when a tab insertion marker is active                  |
| `.horizon-layout-tabgroup__tab-drop-zone`                          | Invisible tab insertion hit target                           |
| `.horizon-layout-tabgroup__tab-drop-zone--{n}`                     | Numeric index modifier (0 … tabs.length)                     |
| `.horizon-layout-tabgroup__tab-drop-zone--end`                     | Modifier for the trailing hit target                         |
| `.horizon-layout-tabgroup__controls`                               | Container for shared tab-group snippets                      |
| `.horizon-layout-tabgroup__control`                                | Individual shared control wrapper                            |
| `.horizon-layout-tabgroup__body`                                   | Content + drop-zone wrapper                                  |
| `.horizon-layout-tabgroup__content`                                | Active view content area                                     |
| `.horizon-layout-tabgroup__drop-zones`                             | Drop-zone overlay (visible during drag)                      |
| `.horizon-layout-tabgroup__drop-hint`                              | Visible pane split hint for the active drop side             |
| `.horizon-layout-tabgroup__drop-hint--top/right/bottom/left`       | Drop hint side modifier                                      |
| `.horizon-layout-tabgroup__drop-zone`                              | Invisible pane split hit target                              |
| `.horizon-layout-tabgroup__drop-zone--top/right/bottom/left`       | Drop-zone side modifier                                      |

---

## Keyboard shortcuts

### Resizer (`role="slider"`)

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

Pass `keyboardControls` to override any subset of these.

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
	// omit splitControls to keep the defaults
};
```

Both arrays replace their respective defaults entirely when provided.

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
		console.warn('Invalid saved layout:', e.message);
	}
}
```

`parseLayoutConfig` only checks the structure, it does not validate that the config is valid. Run `validateConfig` afterwards if you need that guarantee.

---

## `validateConfig`

Validate a `LayoutConfig` before passing it to `HorizonLayout`. Throws an `Error` describing the first problem found if the config is invalid, and returns nothing.

```ts
import { validateConfig } from 'horizon-layout';

try {
	validateConfig(config, views, {
		minWidthRatio: 0.1, // optional, matches your HorizonLayout prop
		minHeightRatio: 0.2 // optional, matches your HorizonLayout prop
	});
	// safe to pass to HorizonLayout, optionally with skipValidation
} catch (e) {
	console.error(e.message);
}
```

Pass `skipValidation` to `HorizonLayout` once you have confirmed the config is valid, to avoid the redundant re-check on every update:

```svelte
<HorizonLayout bind:config {views} skipValidation />
```

---

## Popout windows

Add a view id to `config.popouts` and HorizonLayout opens a new browser window with that view's content. The host page's stylesheets are mirrored into the window automatically. When the user closes the window, `onPopoutClose` is called and the id is removed from `config.popouts`.

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
