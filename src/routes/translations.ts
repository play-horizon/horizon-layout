/**
 * The demo's English text for the strings HorizonLayout writes itself, shared by the main and the
 * nested layout. An app passes its own messages, from its i18n layer, the same way.
 * @module
 */
import type { LayoutTranslations } from '#lib/types.js';

export const translations: LayoutTranslations = {
	resizePane: (pane) => `Resize pane ${pane}`,
	floatingPanel: (title) => `${title}, floating panel`
};
