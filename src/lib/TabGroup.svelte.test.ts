/**
 * Component tests of tab groups, rendered in jsdom through `LayoutHarness` (src/test): the
 * WAI-ARIA tabs semantics of the tab list, selecting tabs with the pointer and the keyboard, and
 * dragging a tab over a group.
 * @module
 */
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import LayoutHarness from '../test/LayoutHarness.svelte';
import type { LayoutConfig } from './types.ts';

/** A stand-in for the `DataTransfer` jsdom lacks, with what a tab drag uses. */
function dataTransfer() {
	return { dropEffect: 'none', effectAllowed: 'none', setDragImage: () => {} };
}

/** Starts dragging `tab`, and waits for the layout to take it out of its group. */
async function startDrag(tab: HTMLElement) {
	await fireEvent.dragStart(tab, { dataTransfer: dataTransfer() });
	await new Promise((resolve) => requestAnimationFrame(resolve));
	await tick();
}

/** Renders the harness with one group of three tabs, the second active, and returns its state. */
function renderGroup() {
	const state = $state<{ config: LayoutConfig }>({
		config: { root: { tabs: ['a', 'b', 'c'], activeTabIndex: 1 } }
	});
	render(LayoutHarness, {
		props: {
			get config() {
				return state.config;
			},
			set config(value) {
				state.config = value;
			},
			ids: ['a', 'b', 'c']
		}
	});
	return state;
}

describe('tab groups', () => {
	it('mark the active tab selected, point the tab list at it and label the panel with it', () => {
		renderGroup();
		const tabList = screen.getByRole('tablist');
		const tabs = within(tabList).getAllByRole('tab');

		expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
			'false',
			'true',
			'false'
		]);
		expect(tabList.getAttribute('aria-activedescendant')).toBe(tabs[1]!.id);

		const panel = screen.getByRole('tabpanel', { name: 'Title of b' });
		expect(tabs[1]!.getAttribute('aria-controls')).toBe(panel.id);
		expect(tabs[0]!.hasAttribute('aria-controls')).toBe(false);
		expect(within(panel).getByText('Body of b')).toBeTruthy();
	});

	it('keep the focus on the tab list: the tabs are not focusable themselves', () => {
		renderGroup();
		expect(screen.getByRole('tablist').getAttribute('tabindex')).toBe('0');
		for (const tab of screen.getAllByRole('tab')) expect(tab.hasAttribute('tabindex')).toBe(false);
	});

	it('select the tab that is clicked', async () => {
		const state = renderGroup();
		await fireEvent.click(screen.getByRole('tab', { name: 'Title of c' }));

		expect(state.config.root).toEqual({ tabs: ['a', 'b', 'c'], activeTabIndex: 2 });
		expect(screen.getByRole('tab', { name: 'Title of c' }).getAttribute('aria-selected')).toBe(
			'true'
		);
		expect(screen.getByRole('tabpanel', { name: 'Title of c' })).toBeTruthy();
	});

	it('move the active descendant with the keys pressed in the tab list', async () => {
		renderGroup();
		const tabList = screen.getByRole('tablist');

		await fireEvent.keyDown(tabList, { key: 'Home' });
		expect(tabList.getAttribute('aria-activedescendant')).toBe(
			screen.getByRole('tab', { name: 'Title of a' }).id
		);
		await fireEvent.keyDown(tabList, { key: 'ArrowLeft' });
		expect(tabList.getAttribute('aria-activedescendant')).toBe(
			screen.getByRole('tab', { name: 'Title of c' }).id
		);
	});

	it('hide their drop zones from assistive technologies while a tab is dragged', async () => {
		renderGroup();
		await startDrag(screen.getByRole('tab', { name: 'Title of a' }));

		const zones = document.querySelectorAll('.horizon-layout-tabgroup__drop-zone');
		expect(zones).toHaveLength(4);
		for (const zone of zones) expect(zone.getAttribute('aria-hidden')).toBe('true');
		expect(screen.queryAllByRole('region')).toEqual([]);
	});
});
