/**
 * The types of the drag-and-drop state shared by HorizonLayout and the components it renders.
 * Internal to the library.
 * @module
 */

/** A side of a tab group a dragged tab can be dropped on, to make it a new pane there. */
export type DropSide = 'top' | 'right' | 'bottom' | 'left';

/**
 * Where a dragged tab would go: a side of a tab group (a new pane), or a place in its tab bar
 * (`tabIndex`, from 0 before the first tab to `tabs.length` after the last).
 */
export type DropTarget =
	| {
			side: DropSide;
			tabIndex?: never;
	  }
	| {
			tabIndex: number;
			side?: never;
	  };
