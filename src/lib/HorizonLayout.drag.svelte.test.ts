/**
 * Component tests of dragging tabs in HorizonLayout, rendered in jsdom through `LayoutHarness`
 * (src/test) with synthetic drag events: dropping a tab on a tab bar or on a side of a group,
 * cancelling, and the layout changing outside in the middle of a drag.
 * @module
 */
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { fakeDataTransfer } from '../test/drag.ts';
import LayoutHarness from '../test/LayoutHarness.svelte';
import type { LayoutConfig, SplitConfig } from './types.ts';

function twoPanes(): LayoutConfig {
	return {
		root: {
			direction: 'horizontal',
			views: [
				{ tabs: ['a', 'b'], activeTabIndex: 1 },
				{ tabs: ['c'], activeTabIndex: 0 }
			],
			splitPoints: [0.5]
		}
	};
}

/** Renders the harness with a config and view ids held in `$state`, and returns them. */
function renderLayout(initial: LayoutConfig) {
	const state = $state({ config: initial, ids: ['a', 'b', 'c', 'd'] });
	const { container } = render(LayoutHarness, {
		props: {
			get config() {
				return state.config;
			},
			set config(value) {
				state.config = value;
			},
			get ids() {
				return state.ids;
			}
		}
	});
	return { state, container };
}

/** What a drag event carries; jsdom has no DataTransfer. */
function dataTransfer() {
	return { dataTransfer: fakeDataTransfer() };
}

function nextFrame() {
	return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function tab(title: string) {
	return screen.getByRole('tab', { name: title });
}

/** Starts dragging the tab titled `title`, and waits for the frame that takes it out. */
async function startDrag(title: string) {
	const element = tab(title);
	await fireEvent.dragStart(element, dataTransfer());
	await nextFrame();
	flushSync();
	return element;
}

/** The tab groups (`<section>`), in document order. */
function groups(container: HTMLElement) {
	return [...container.querySelectorAll<HTMLElement>('section.horizon-layout-tabgroup')];
}

async function dropOn(zone: Element) {
	await fireEvent.dragOver(zone, dataTransfer());
	await fireEvent.drop(zone, dataTransfer());
}

describe('dragging a tab', () => {
	it('carries the view id as its data, which Firefox needs to start the drag', async () => {
		renderLayout(twoPanes());
		const transfer = fakeDataTransfer();
		await fireEvent.dragStart(tab('Title of b'), { dataTransfer: transfer });
		expect(transfer.data.get('application/x-horizon-layout-tab')).toBe('b');
	});

	it('takes it out of its group without changing the bound config until the drop', async () => {
		const { state, container } = renderLayout(twoPanes());
		await startDrag('Title of b');

		expect(screen.queryByRole('tab', { name: 'Title of b' })).toBeNull();
		expect(screen.getByText('Body of a')).toBeTruthy();
		expect(container.querySelector('.horizon-layout-tabgroup__drop-zones')).toBeTruthy();
		expect(state.config).toEqual(twoPanes());
	});

	it('drops it at the end of another tab bar', async () => {
		const { state, container } = renderLayout(twoPanes());
		const source = await startDrag('Title of b');

		await dropOn(
			groups(container)[1]!.querySelector('.horizon-layout-tabgroup__tab-drop-zone--end')!
		);
		await fireEvent.dragEnd(source);

		expect(state.config.root).toEqual({
			direction: 'horizontal',
			views: [
				{ tabs: ['a'], activeTabIndex: 0 },
				{ tabs: ['c', 'b'], activeTabIndex: 1 }
			],
			splitPoints: [0.5]
		});
		expect(container.querySelector('.horizon-layout-tabgroup__drop-zones')).toBeNull();
	});

	it('drops it as a new pane on a side of a group, halving that group', async () => {
		const { state, container } = renderLayout(twoPanes());
		await startDrag('Title of a');

		await dropOn(
			groups(container)[1]!.querySelector('.horizon-layout-tabgroup__drop-zone--right')!
		);

		expect(state.config.root).toEqual({
			direction: 'horizontal',
			views: [
				{ tabs: ['b'], activeTabIndex: 0 },
				{ tabs: ['c'], activeTabIndex: 0 },
				{ tabs: ['a'], activeTabIndex: 0 }
			],
			splitPoints: [0.5, 0.75]
		});
	});

	it('removes the group its only tab leaves, and the split left with one pane', async () => {
		const { state, container } = renderLayout(twoPanes());
		await startDrag('Title of c');
		expect(groups(container)).toHaveLength(1);

		await dropOn(
			groups(container)[0]!.querySelector('.horizon-layout-tabgroup__tab-drop-zone--0')!
		);

		expect(state.config.root).toEqual({ tabs: ['c', 'a', 'b'], activeTabIndex: 0 });
	});

	it('puts it back where it was when the drag is cancelled', async () => {
		const { state, container } = renderLayout(twoPanes());
		const source = await startDrag('Title of b');

		await fireEvent.dragEnd(source);

		expect(state.config).toEqual(twoPanes());
		expect(within(groups(container)[0]!).getByRole('tab', { name: 'Title of b' })).toBeTruthy();
		expect(container.querySelector('.horizon-layout-tabgroup__drop-zones')).toBeNull();
	});

	it('leaves the tab in place when the drag ends before its first frame', async () => {
		const { state, container } = renderLayout(twoPanes());
		const source = tab('Title of b');

		await fireEvent.dragStart(source, dataTransfer());
		await fireEvent.dragEnd(source);
		await nextFrame();
		flushSync();

		expect(state.config).toEqual(twoPanes());
		expect(tab('Title of b')).toBeTruthy();
		expect(container.querySelector('.horizon-layout-tabgroup__drop-zones')).toBeNull();
	});

	it('goes on when a view is added to the views map', async () => {
		const { state, container } = renderLayout(twoPanes());
		await startDrag('Title of b');

		state.ids = [...state.ids, 'e'];
		flushSync();
		const ends = container.querySelectorAll('.horizon-layout-tabgroup__tab-drop-zone--end');
		await dropOn(ends[1]!);
		await fireEvent.dragEnd(window);

		expect((state.config.root as SplitConfig).views).toEqual([
			{ tabs: ['a'], activeTabIndex: 0 },
			{ tabs: ['c', 'b'], activeTabIndex: 1 }
		]);
	});

	it('is cancelled by a change of the config outside, which a later drop leaves alone', async () => {
		const { state, container } = renderLayout(twoPanes());
		await startDrag('Title of b');

		const next: LayoutConfig = { root: { tabs: ['a', 'b', 'c'], activeTabIndex: 0 } };
		state.config = next;
		flushSync();
		expect(container.querySelector('.horizon-layout-tabgroup__drop-zones')).toBeNull();

		await fireEvent.drop(window, dataTransfer());
		expect(state.config).toEqual({ root: { tabs: ['a', 'b', 'c'], activeTabIndex: 0 } });
	});

	it('doesn’t start when the config outside moved the tab before its first frame', async () => {
		const { state, container } = renderLayout(twoPanes());
		await fireEvent.dragStart(tab('Title of b'), dataTransfer());

		state.config = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['c', 'b'], activeTabIndex: 0 }
				],
				splitPoints: [0.5]
			}
		};
		flushSync();
		await nextFrame();
		flushSync();

		expect(container.querySelector('.horizon-layout-tabgroup__drop-zones')).toBeNull();
		expect(within(groups(container)[1]!).getByRole('tab', { name: 'Title of b' })).toBeTruthy();
	});
});
