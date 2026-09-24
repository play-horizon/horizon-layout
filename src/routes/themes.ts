// Demo themes for the HorizonLayout example page.
// Each theme maps onto the --hl-* CSS custom properties consumed by horizon-layout.css.

export interface DemoTheme {
	id: string;
	name: string;
	/** Class applied to a wrapper element that defines the --hl-* variables. */
	className: string;
}

export const themes: DemoTheme[] = [
	{ id: 'light', name: 'Paper', className: 'theme-paper' },
	{ id: 'nord', name: 'Nordic', className: 'theme-nordic' },
	{ id: 'dark', name: 'Midnight', className: 'theme-midnight' },
	{ id: 'dracula', name: 'Blood Moon', className: 'theme-bloodmoon' },
	{ id: 'forest', name: 'Forest', className: 'theme-forest' },
	{ id: 'solar', name: 'Solar Flare', className: 'theme-solar' },
	{ id: 'rose', name: 'Rosewood', className: 'theme-rosewood' },
	{ id: 'ocean', name: 'Deep Sea', className: 'theme-deepsea' }
];

export const themeClassMap = Object.fromEntries(themes.map((t) => [t.id, t.className]));
