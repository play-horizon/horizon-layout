/**
 * Component tests of HorizonLayout, rendered in jsdom through `LayoutHarness` (src/test): what it
 * renders, its accessible names, and how it applies config changes.
 * @module
 */
import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import LayoutHarness from '../test/LayoutHarness.svelte';
import { mounts } from '../test/ViewBody.svelte';
import type { LayoutConfig } from './types.ts';

function twoPanes(): LayoutConfig {
	return {
		root: {
			direction: 'horizontal',
			views: [
				{ tabs: ['a', 'b'], activeTabIndex: 0 },
				{ tabs: ['c'], activeTabIndex: 0 }
			],
			splitPoints: [0.5]
		}
	};
}

/** Renders the harness with a config held in `$state`, and returns it. */
function renderLayout(initial: LayoutConfig) {
	const state = $state({ config: initial });
	render(LayoutHarness, {
		props: {
			get config() {
				return state.config;
			},
			set config(value) {
				state.config = value;
			},
			ids: ['a', 'b', 'c', 'd']
		}
	});
	return state;
}

beforeEach(() => mounts.clear());

describe('HorizonLayout', () => {
	it('renders the active tab of each group', () => {
		renderLayout(twoPanes());
		expect(screen.getByText('Body of a')).toBeTruthy();
		expect(screen.getByText('Body of c')).toBeTruthy();
		expect(screen.queryByText('Body of b')).toBeNull();
		expect(screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())).toEqual([
			'Title of a',
			'Title of b',
			'Title of c'
		]);
	});

	it('names the resize handles with the translations', () => {
		renderLayout(twoPanes());
		expect(screen.getByRole('slider').getAttribute('aria-label')).toBe('Resize pane 1');
	});
});
