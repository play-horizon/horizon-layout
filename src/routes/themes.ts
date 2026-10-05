// Themes for the demo page. Each class sets the --hl-* custom properties read by
// horizon-layout.css. `light` comes from the library; the others live in demo-themes.css.

export interface DemoTheme {
	id: string;
	name: string;
	/** Class applied to a wrapper element that defines the --hl-* variables. */
	className: string;
}

export const themes: DemoTheme[] = [
	{ id: 'dark', name: 'Dark', className: 'theme-dark' },
	{ id: 'light', name: 'Light', className: 'light' },
	{ id: 'nord', name: 'Nord', className: 'theme-nord' }
];

export const themeClassMap = Object.fromEntries(themes.map((t) => [t.id, t.className]));
