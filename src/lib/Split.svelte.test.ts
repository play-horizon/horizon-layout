/**
 * Component tests of splits, rendered in jsdom through `LayoutHarness` (src/test): the resize
 * handle's window-splitter semantics, and moving it with the pointer and the keyboard. jsdom has
 * neither layout nor pointer capture, so the split's box is given by hand and the capture is
 * stubbed.
 * @module
 */
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import LayoutHarness from '../test/LayoutHarness.svelte';
import { release, stubPointerCapture } from '../test/pointer-capture.ts';
import type { LayoutConfig, SplitConfig } from './types.ts';

stubPointerCapture();

/** Renders two panes side by side in a split 1000 px wide, and returns the config's state. */
function renderSplit() {
	const state = $state<{ config: LayoutConfig }>({
		config: {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 }
				],
				splitPoints: [0.5]
			}
		}
	});
	const { container } = render(LayoutHarness, {
		props: {
			get config() {
				return state.config;
			},
			set config(value) {
				state.config = value;
			},
			ids: ['a', 'b']
		}
	});
	const split = container.querySelector('.horizon-layout-split')!;
	split.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 800);
	return state;
}

function splitPoints(state: { config: LayoutConfig }): number[] {
	return (state.config.root as SplitConfig).splitPoints;
}

describe('split resize handles', () => {
	it('are window splitters named by the translations, valued in percent', () => {
		renderSplit();
		const handle = screen.getByRole('separator', { name: 'Resize pane 1' });
		expect(handle.tabIndex).toBe(0);
		// Between panes side by side, the separator itself is vertical.
		expect(handle.getAttribute('aria-orientation')).toBe('vertical');
		expect(handle.getAttribute('aria-valuenow')).toBe('50');
		expect(handle.getAttribute('aria-valuetext')).toBe('50.00%');
		expect(handle.getAttribute('aria-valuemin')).toBe('10');
		expect(handle.getAttribute('aria-valuemax')).toBe('90');
		const primaryPane = document.getElementById(handle.getAttribute('aria-controls')!);
		expect(primaryPane?.textContent).toContain('Body of a');
	});

	it('are horizontal between stacked panes', () => {
		render(LayoutHarness, {
			props: {
				config: {
					root: {
						direction: 'vertical',
						views: [
							{ tabs: ['a'], activeTabIndex: 0 },
							{ tabs: ['b'], activeTabIndex: 0 },
							{ tabs: ['c'], activeTabIndex: 0 }
						],
						splitPoints: [0.3, 0.6]
					}
				},
				ids: ['a', 'b', 'c']
			}
		});
		const [first, second] = screen.getAllByRole('separator');
		expect(first!.getAttribute('aria-orientation')).toBe('horizontal');
		expect(second!.getAttribute('aria-label')).toBe('Resize pane 2');
		const primaryPane = document.getElementById(second!.getAttribute('aria-controls')!);
		expect(primaryPane?.textContent).toContain('Body of b');
		expect(primaryPane?.textContent).not.toContain('Body of c');
	});

	it('keep a finger dragging them from panning the page, whatever the theme', () => {
		renderSplit();
		expect(screen.getByRole('separator').style.touchAction).toBe('none');
	});

	it('follow a primary-button drag, until the pointer is released', async () => {
		const state = renderSplit();
		const handle = screen.getByRole('separator');

		await fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 500 });
		await fireEvent.pointerMove(handle, { pointerId: 1, clientX: 300 });
		expect(splitPoints(state)).toEqual([0.3]);
		expect(handle.getAttribute('aria-valuenow')).toBe('30');

		await release(handle, 1);
		await fireEvent.pointerMove(handle, { pointerId: 1, clientX: 700 });
		expect(splitPoints(state)).toEqual([0.3]);
	});

	it('stop at the smallest pane size', async () => {
		const state = renderSplit();
		const handle = screen.getByRole('separator');

		await fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 500 });
		await fireEvent.pointerMove(handle, { pointerId: 1, clientX: 20 });
		expect(splitPoints(state)).toEqual([0.1]);
	});

	it('ignore the other buttons, and the other pointers during a drag', async () => {
		const state = renderSplit();
		const handle = screen.getByRole('separator');

		await fireEvent.pointerDown(handle, { button: 2, pointerId: 1, clientX: 500 });
		await fireEvent.pointerMove(handle, { pointerId: 1, clientX: 300 });
		expect(splitPoints(state)).toEqual([0.5]);

		await fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 500 });
		await fireEvent.pointerMove(handle, { pointerId: 2, clientX: 300 });
		expect(splitPoints(state)).toEqual([0.5]);
		await release(handle, 2);
		await fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400 });
		expect(splitPoints(state)).toEqual([0.4]);
	});

	it('end a gesture whose end was missed when pressed again', async () => {
		const state = renderSplit();
		const handle = screen.getByRole('separator');

		await fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 500 });
		await fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: 500 });
		await fireEvent.pointerMove(handle, { pointerId: 1, clientX: 300 });
		expect(splitPoints(state)).toEqual([0.5]);
		await fireEvent.pointerMove(handle, { pointerId: 2, clientX: 600 });
		expect(splitPoints(state)).toEqual([0.6]);
	});

	it('move with the keys, by 1 %, 10 % with Shift, and to the ends with Home and End', async () => {
		const state = renderSplit();
		const handle = screen.getByRole('separator');

		await fireEvent.keyDown(handle, { key: 'ArrowRight' });
		expect(splitPoints(state)).toEqual([0.51]);
		await fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
		expect(splitPoints(state)).toEqual([0.41]);
		await fireEvent.keyDown(handle, { key: 'Home' });
		expect(splitPoints(state)).toEqual([0.1]);
		await fireEvent.keyDown(handle, { key: 'End' });
		expect(splitPoints(state)).toEqual([0.9]);
	});
});
