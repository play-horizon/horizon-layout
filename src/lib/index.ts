/**
 * The package entry point of horizon-layout: the `HorizonLayout` component, every public type, the
 * config helpers of `utils.ts`, the floating-group geometry of `floating.ts` and the English text
 * of `translations.ts`. The default theme is a separate export,
 * `horizon-layout/horizon-layout.css`.
 * @module
 */
export { default as HorizonLayout } from './HorizonLayout.svelte';
export type * from './types.ts';
export * from './utils.ts';
export * from './floating.ts';
export * from './translations.ts';
