/**
 * The demo's themes. Each class sets the --hl-* custom properties read by horizon-layout.css;
 * `light` comes from the library, the others live in demo-themes.css.
 * @module
 */

/** A theme the demo offers. */
export interface DemoTheme {
	/** Its stable id, saved with the demo's state. */
	id: string;
	/** Its name in the theme selects. */
	name: string;
	/** Class applied to a wrapper element that defines the --hl-* variables. */
	className: string;
}

/** Every theme, the first one being the default. */
export const themes: DemoTheme[] = [
	{ id: 'dark', name: 'Dark', className: 'theme-dark' },
	{ id: 'light', name: 'Light', className: 'light' },
	{ id: 'nord', name: 'Nord', className: 'theme-nord' }
];

/** The class of each theme, by id. */
export const themeClassMap = Object.fromEntries(themes.map((t) => [t.id, t.className]));
