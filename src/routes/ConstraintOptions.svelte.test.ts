/**
 * Component tests of the demo's constraint fields (`ConstraintOptions.svelte`): the value each
 * field shows once a typed one is clamped or refused.
 * @module
 */
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { LayoutConfig } from '#lib/types.js';
import { validateConfig } from '#lib/utils.js';
import ConstraintOptions from './ConstraintOptions.svelte';

/** Renders the fields for a layout of three side-by-side panes, and returns their state. */
function renderOptions() {
	const state = $state({
		config: {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 },
					{ tabs: ['c'], activeTabIndex: 0 }
				],
				splitPoints: [0.2, 0.6]
			}
		} as LayoutConfig,
		minWidthRatio: 0.1,
		minHeightRatio: 0.2,
		maxDepth: 6
	});
	render(ConstraintOptions, {
		props: {
			get config() {
				return state.config;
			},
			set config(value) {
				state.config = value;
			},
			get minWidthRatio() {
				return state.minWidthRatio;
			},
			set minWidthRatio(value) {
				state.minWidthRatio = value;
			},
			get minHeightRatio() {
				return state.minHeightRatio;
			},
			set minHeightRatio(value) {
				state.minHeightRatio = value;
			},
			get maxDepth() {
				return state.maxDepth;
			},
			set maxDepth(value) {
				state.maxDepth = value;
			}
		}
	});
	return state;
}

describe('ConstraintOptions', () => {
	it('applies a feasible minimum and moves the split points to respect it', async () => {
		const state = renderOptions();
		const field = screen.getByLabelText('Min width ratio') as HTMLInputElement;

		await fireEvent.change(field, { target: { value: '0.3' } });
		expect(state.minWidthRatio).toBe(0.3);
		expect(field.value).toBe('0.3');
		// The first pane grows from 0.2 to 0.3; the second, 0.3 wide, stays put.
		expect(state.config.root).toMatchObject({ splitPoints: [0.3, 0.6] });
	});

	it('keeps showing the minimum in effect when a larger one is refused', async () => {
		const state = renderOptions();
		const field = screen.getByLabelText('Min width ratio') as HTMLInputElement;

		// Three panes can't each be 40% wide.
		await fireEvent.change(field, { target: { value: '0.4' } });
		expect(state.minWidthRatio).toBe(0.1);
		expect(field.value).toBe('0.1');
		expect(screen.getByRole('alert').textContent).toBe(
			'Too large: some splits could not satisfy this minimum width'
		);
	});

	it('shows the clamped value of an out-of-range entry', async () => {
		const state = renderOptions();
		const height = screen.getByLabelText('Min height ratio') as HTMLInputElement;
		const depth = screen.getByLabelText('Max split depth') as HTMLInputElement;

		await fireEvent.change(height, { target: { value: '0.9' } });
		await fireEvent.change(depth, { target: { value: '25' } });
		expect(state.minHeightRatio).toBe(0.45);
		expect(height.value).toBe('0.45');
		expect(state.maxDepth).toBe(10);
		expect(depth.value).toBe('10');
	});

	it('refuses a maximum depth the layout is already deeper than', async () => {
		const state = renderOptions();
		const depth = screen.getByLabelText('Max split depth') as HTMLInputElement;

		// Three panes side by side: a split of tab groups, 2 deep.
		await fireEvent.change(depth, { target: { value: '1' } });
		expect(state.maxDepth).toBe(6);
		expect(depth.value).toBe('6');
		expect(screen.getByRole('alert').textContent).toBe('Too small: the layout is 2 deep');

		await fireEvent.change(depth, { target: { value: '2' } });
		expect(state.maxDepth).toBe(2);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('takes a minimum at 4 decimals, as the layout does, keeping the split points valid', async () => {
		const state = renderOptions();
		state.config.root = {
			direction: 'horizontal',
			views: [
				{ tabs: ['a'], activeTabIndex: 0 },
				{ tabs: ['b'], activeTabIndex: 0 },
				{ tabs: ['c'], activeTabIndex: 0 }
			],
			splitPoints: [0.1074, 0.15]
		};
		const field = screen.getByLabelText('Min width ratio') as HTMLInputElement;

		await fireEvent.change(field, { target: { value: '0.10005' } });

		expect(state.minWidthRatio).toBe(0.1001);
		const views = new Map(['a', 'b', 'c'].map((id) => [id, null]));
		expect(() => validateConfig(state.config, views, { minWidthRatio: 0.10005 })).not.toThrow();
	});
});
