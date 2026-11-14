/**
 * Component tests of HorizonLayout, rendered in jsdom through `LayoutHarness` (src/test): what it
 * renders, its accessible names, and how it applies config changes.
 * @module
 */
import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import LayoutHarness from '../test/LayoutHarness.svelte';
import { mounts } from '../test/ViewBody.svelte';
import type { KeyboardControls, LayoutConfig, SplitConfig, TabGroupConfig } from './types.ts';

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
function renderLayout(initial: LayoutConfig, keyboardControls?: KeyboardControls) {
	const state = $state({ config: initial });
	render(LayoutHarness, {
		props: {
			get config() {
				return state.config;
			},
			set config(value) {
				state.config = value;
			},
			ids: ['a', 'b', 'c', 'd'],
			keyboardControls
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

	it('keeps the panels whose place is unchanged mounted when the config changes outside', () => {
		const state = renderLayout(twoPanes());
		const second = (state.config.root as SplitConfig).views[1] as TabGroupConfig;
		second.tabs.push('d');
		second.activeTabIndex = 1;
		flushSync();
		expect(screen.getByText('Body of d')).toBeTruthy();
		expect(mounts.get('a')).toBe(1);
	});

	it('keeps the panels mounted when the config is replaced by an equal-shaped one', () => {
		const state = renderLayout(twoPanes());
		const next = twoPanes();
		(next.root as SplitConfig).splitPoints = [0.3];
		state.config = next;
		flushSync();
		expect(mounts.get('a')).toBe(1);
		expect(mounts.get('c')).toBe(1);
	});

	it('keeps the built-in controls of a category the keyboard controls leave out', async () => {
		const state = renderLayout(twoPanes(), { splitControls: [] });
		const [tabList] = screen.getAllByRole('tablist');
		await fireEvent.keyDown(tabList!, { key: 'ArrowRight' });
		expect(((state.config.root as SplitConfig).views[0] as TabGroupConfig).activeTabIndex).toBe(1);

		await fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
		expect((state.config.root as SplitConfig).splitPoints).toEqual([0.5]);
	});
});
