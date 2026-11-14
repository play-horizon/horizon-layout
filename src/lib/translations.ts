/**
 * The English text of horizon-layout: what HorizonLayout writes itself (its accessible names)
 * when the app passes no translation of its own for it.
 * @module
 */
import type { LayoutTranslations } from './types.ts';

/**
 * The English text HorizonLayout uses for every key its `translations` prop leaves out.
 *
 * @example
 * englishTranslations.resizePane(1); // "Resize pane 1"
 */
export const englishTranslations: LayoutTranslations = {
	resizePane: (pane) => `Resize pane ${pane}`
};
