/**
 * Vite configuration of the demo site (the SvelteKit app in `src/routes`, built with
 * adapter-static for GitHub Pages under `BASE_PATH`) and of the tests: vitest runs the
 * `*.test.ts` files under `src` in jsdom with Svelte's browser build (`svelteTesting`), which also
 * unmounts the components a test rendered once it ends; `src/test/setup.ts` fills in the
 * browser APIs jsdom lacks.
 * @module
 */
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
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
			adapter: adapter()
		}),
		svelteTesting()
	],
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
		setupFiles: ['src/test/setup.ts']
	}
});
