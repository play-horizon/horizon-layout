/**
 * Vite configuration of the demo site (the SvelteKit app in `src/routes`, built with
 * adapter-static for GitHub Pages under `BASE_PATH`, without version polling, with its Mingcute
 * icons compiled into Svelte components by unplugin-icons) and of the tests: vitest runs the
 * `*.test.ts` files under `src` in jsdom with Svelte's browser build (`svelteTesting`), which also
 * unmounts the components a test rendered once it ends; `src/test/setup.ts` fills in the
 * browser APIs jsdom lacks.
 * @module
 */
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			paths: {
				base: (process.env['BASE_PATH'] ?? '') as '' | `/${string}`
			},
			adapter: adapter(),
			// A static demo: no hourly request for a new version (updated.current is never read).
			// SvelteKit still checks when the tab regains the focus or becomes visible, which no
			// option turns off.
			version: { pollInterval: 0 }
		}),
		Icons({ compiler: 'svelte' }),
		svelteTesting()
	],
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
		setupFiles: ['src/test/setup.ts']
	}
});
