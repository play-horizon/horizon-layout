import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// GitHub Pages serves project sites from /<repo>. Set BASE_PATH in CI (e.g. /horizon-layout).
		paths: {
			base: process.env.BASE_PATH ?? ''
		},
		adapter: adapter()
	}
};

export default config;
