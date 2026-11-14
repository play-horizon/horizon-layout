/**
 * Component tests of tab groups, rendered in jsdom through `LayoutHarness` (src/test): the
 * WAI-ARIA tabs semantics of the tab list, selecting tabs with the pointer and the keyboard,
 * how the tabs' own controls are exposed and keep their keys, dragging a tab over a group, and
 * what a touch drag of a tab needs.
 * @module
 */
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import HorizonLayout from './HorizonLayout.svelte';
import { describe, expect, it } from 'vitest';
import { fakeDataTransfer } from '../test/drag.ts';
import LayoutHarness from '../test/LayoutHarness.svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FloatingGroupConfig, Id, LayoutConfig, SplitConfig, View } from './types.ts';

const dataTransfer = fakeDataTransfer;

/** Starts dragging `tab`, and waits for the layout to take it out of its group. */
async function startDrag(tab: HTMLElement) {
	await fireEvent.dragStart(tab, { dataTransfer: dataTransfer() });
	await new Promise((resolve) => requestAnimationFrame(resolve));
	await tick();
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

/** Renders one group of three tabs, the second active, and returns its state. */
function renderGroup() {
	return renderLayout({ root: { tabs: ['a', 'b', 'c'], activeTabIndex: 1 } });
}

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

/** The tab group element whose tab list holds the tab titled after `id`. */
function groupOf(id: string): HTMLElement {
	return screen.getByRole('tab', { name: `Title of ${id}` }).closest('section')!;
}

/** The drop zone of `group` matching `modifier` (a side, or a tab index). */
function zoneOf(group: HTMLElement, modifier: string): HTMLElement {
	const zone = group.querySelector<HTMLElement>(
		`.horizon-layout-tabgroup__drop-zone--${modifier}, .horizon-layout-tabgroup__tab-drop-zone--${modifier}`
	);
	if (!zone) throw new Error(`no drop zone ${modifier}`);
	return zone;
}

describe('tab groups', () => {
	it('name their tab list with the translations, from the active tab', async () => {
		const state = renderGroup();
		expect(screen.getByRole('tablist', { name: 'Tabs, Title of b shown' })).toBeTruthy();

		state.config.root = { tabs: ['a', 'b', 'c'], activeTabIndex: 2 };
		await tick();
		expect(screen.getByRole('tablist', { name: 'Tabs, Title of c shown' })).toBeTruthy();
	});

	it('mark the active tab selected, point the tab list at it and label the panel with it', () => {
		renderGroup();
		const tabList = screen.getByRole('tablist');
		const tabs = screen.getAllByRole('tab');

		// The tab list owns its tabs, laid out beside it with their controls.
		expect(tabList.getAttribute('aria-owns')).toBe(tabs.map((tab) => tab.id).join(' '));
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

	it('show the drop hint of the side under a dragged tab, until it leaves', async () => {
		renderLayout(twoPanes());
		const target = groupOf('c');
		await startDrag(screen.getByRole('tab', { name: 'Title of b' }));

		await fireEvent.dragOver(zoneOf(target, 'right'), { dataTransfer: dataTransfer() });
		expect(target.querySelector('.horizon-layout-tabgroup__drop-hint--right')).not.toBeNull();
		await fireEvent.dragLeave(zoneOf(target, 'right'));
		expect(target.querySelector('.horizon-layout-tabgroup__drop-hint')).toBeNull();
	});

	it('split the group on the side a tab is dropped on', async () => {
		const state = renderLayout(twoPanes());
		const target = groupOf('c');
		await startDrag(screen.getByRole('tab', { name: 'Title of b' }));

		await fireEvent.dragOver(zoneOf(target, 'right'), { dataTransfer: dataTransfer() });
		await fireEvent.drop(zoneOf(target, 'right'), { dataTransfer: dataTransfer() });
		await fireEvent.dragEnd(window);

		expect(state.config.root).toEqual({
			direction: 'horizontal',
			views: [
				{ tabs: ['a'], activeTabIndex: 0 },
				{ tabs: ['c'], activeTabIndex: 0 },
				{ tabs: ['b'], activeTabIndex: 0 }
			],
			splitPoints: [0.5, 0.75]
		});
		expect(document.querySelector('.horizon-layout-tabgroup__drop-hint')).toBeNull();
	});

	it('drop on the zone under the pointer at the drop, even right after a dragleave', async () => {
		const state = renderLayout(twoPanes());
		const target = groupOf('c');
		await startDrag(screen.getByRole('tab', { name: 'Title of b' }));

		// Moving between two zones of a group fires the dragleave of the old one after the
		// dragenter of the new one, so a drop can come before the next dragover.
		await fireEvent.dragOver(zoneOf(target, 'right'), { dataTransfer: dataTransfer() });
		await fireEvent.dragLeave(zoneOf(target, 'right'));
		await fireEvent.drop(zoneOf(target, 'right'), { dataTransfer: dataTransfer() });
		await fireEvent.dragEnd(window);

		expect((state.config.root as SplitConfig).views).toHaveLength(3);
	});

	it('insert a tab dropped between tabs at that place, showing where first', async () => {
		const state = renderLayout(twoPanes());
		const target = groupOf('c');
		await startDrag(screen.getByRole('tab', { name: 'Title of b' }));

		await fireEvent.dragOver(zoneOf(target, '0'), { dataTransfer: dataTransfer() });
		expect(
			target
				.querySelector('.horizon-layout-tabgroup__tab-drop-hint--0')!
				.classList.contains('horizon-layout-tabgroup__tab-drop-hint--hover')
		).toBe(true);
		await fireEvent.drop(zoneOf(target, '0'), { dataTransfer: dataTransfer() });
		await fireEvent.dragEnd(window);

		expect(state.config.root).toEqual({
			direction: 'horizontal',
			views: [
				{ tabs: ['a'], activeTabIndex: 0 },
				{ tabs: ['b', 'c'], activeTabIndex: 0 }
			],
			splitPoints: [0.5]
		});
	});

	it('put a dragged tab back when the drag is cancelled', async () => {
		const state = renderLayout(twoPanes());
		const target = groupOf('c');
		await startDrag(screen.getByRole('tab', { name: 'Title of b' }));

		await fireEvent.dragOver(zoneOf(target, 'left'), { dataTransfer: dataTransfer() });
		await fireEvent.dragLeave(zoneOf(target, 'left'));
		await fireEvent.dragEnd(window);

		expect(state.config).toEqual(twoPanes());
	});

	it('take a dragged tab into a floating group’s tab bar only', async () => {
		const floating: FloatingGroupConfig = {
			tabs: ['d'],
			activeTabIndex: 0,
			rect: { x: 0, y: 0, width: 300, height: 200 }
		};
		const state = renderLayout({ ...twoPanes(), floating: [floating] });
		const target = groupOf('d');
		await startDrag(screen.getByRole('tab', { name: 'Title of b' }));

		const refused = dataTransfer();
		const allowed = await fireEvent.dragOver(zoneOf(target, 'right'), { dataTransfer: refused });
		expect(allowed).toBe(true);
		expect(refused.dropEffect).toBe('none');
		expect(target.querySelector('.horizon-layout-tabgroup__drop-hint')).toBeNull();
		await fireEvent.drop(zoneOf(target, 'right'), { dataTransfer: dataTransfer() });
		await fireEvent.dragEnd(window);

		expect(state.config).toEqual({ ...twoPanes(), floating: [floating] });
	});

	it('let a target that takes the tab show the move', async () => {
		renderLayout(twoPanes());
		await startDrag(screen.getByRole('tab', { name: 'Title of b' }));

		const transfer = dataTransfer();
		const notCancelled = await fireEvent.dragOver(zoneOf(groupOf('c'), 'right'), {
			dataTransfer: transfer
		});
		expect(notCancelled).toBe(false);
		expect(transfer.dropEffect).toBe('move');
	});
});

describe('tab controls', () => {
	/**
	 * Renders views a and b, each with a close button among its tab controls, and c without
	 * controls, as `config`.
	 */
	function renderWithControls(config: LayoutConfig) {
		const body = createRawSnippet(() => ({ render: () => '<p>Body</p>' }));
		const closeButton = createRawSnippet((id: () => Id) => ({
			render: () => `<button>Close ${id()}</button>`
		}));
		const view = (id: Id, controls: boolean): View => ({
			title: `Title of ${id}`,
			snippet: body,
			tabControls: controls ? [closeButton] : []
		});
		render(HorizonLayout, {
			props: {
				config,
				views: new SvelteMap([
					['a', view('a', true)],
					['b', view('b', true)],
					['c', view('c', false)]
				])
			}
		});
	}

	it('are named buttons, grouped under their tab’s title, outside the tab and the tab list', () => {
		renderWithControls({ root: { tabs: ['a', 'b', 'c'], activeTabIndex: 0 } });

		for (const id of ['a', 'b']) {
			const group = screen.getByRole('group', { name: `Title of ${id}` });
			const button = within(group).getByRole('button', { name: `Close ${id}` });
			expect(button.closest('[role="tab"], [role="tablist"]')).toBeNull();
		}
		// A tab is named by its title only, and so is the panel it labels.
		expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
			'Title of a',
			'Title of b',
			'Title of c'
		]);
		expect(screen.getByRole('tabpanel', { name: 'Title of a' })).toBeTruthy();
		// No group for a tab without controls.
		expect(screen.queryByRole('group', { name: 'Title of c' })).toBeNull();
		// The strip, which scrolls when the tabs overflow, holds the tab list: the keyboard reaches
		// it even when no tab has a control.
		expect(screen.getByRole('tablist').parentElement!.classList).toContain(
			'horizon-layout-tabgroup__tabs'
		);
	});

	it('are laid out the same in a floating group', () => {
		renderWithControls({
			floating: [{ tabs: ['a'], activeTabIndex: 0, rect: { x: 0, y: 0, width: 300, height: 200 } }]
		});
		const frame = screen.getByRole('dialog');
		const group = within(frame).getByRole('group', { name: 'Title of a' });
		expect(within(group).getByRole('button', { name: 'Close a' })).toBeTruthy();
		expect(within(frame).getByRole('tablist').getAttribute('aria-owns')).toBe(
			within(frame).getByRole('tab').id
		);
	});

	it('give the tab list a press on the strip, outside any tab', async () => {
		renderWithControls({ root: { tabs: ['a', 'b'], activeTabIndex: 0 } });
		const strip = document.querySelector<HTMLElement>('.horizon-layout-tabgroup__tabs')!;

		await fireEvent.click(strip);
		expect(document.activeElement).toBe(screen.getByRole('tablist'));
	});

	it('leave the focus in a control pressed, and give the tab list a press on a tab', async () => {
		renderWithControls({ root: { tabs: ['a', 'b'], activeTabIndex: 0 } });
		const button = screen.getByRole('button', { name: 'Close b' });
		button.focus();

		await fireEvent.click(button);
		expect(document.activeElement).toBe(button);

		await fireEvent.click(screen.getByRole('tab', { name: 'Title of b' }));
		expect(document.activeElement).toBe(screen.getByRole('tablist'));
		expect(screen.getByRole('tab', { name: 'Title of b' }).getAttribute('aria-selected')).toBe(
			'true'
		);
	});

	it('keep the keys pressed in them, which don’t reach the tab list', async () => {
		renderWithControls({ root: { tabs: ['a', 'b'], activeTabIndex: 0 } });
		const button = screen.getByRole('button', { name: 'Close b' });
		button.focus();

		await fireEvent.keyDown(button, { key: 'ArrowRight' });
		await fireEvent.keyDown(button, { key: 'Escape' });
		expect(screen.getByRole('tab', { name: 'Title of a' }).getAttribute('aria-selected')).toBe(
			'true'
		);
		expect(document.activeElement).toBe(button);

		await fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
		expect(screen.getByRole('tab', { name: 'Title of b' }).getAttribute('aria-selected')).toBe(
			'true'
		);
	});
});

describe('touch drags of tabs', () => {
	// Read from disk: vitest hands CSS imports to the tests empty.
	const defaultTheme = readFileSync(join(import.meta.dirname, 'horizon-layout.css'), 'utf8');

	/** The declarations of the default theme's rule for exactly `selector`. */
	function ruleOf(selector: string): string {
		const start = defaultTheme.indexOf(`\n${selector} {`);
		if (start === -1) throw new Error(`no rule ${selector}`);
		return defaultTheme.slice(start, defaultTheme.indexOf('}', start));
	}

	it('have the tabs draggable, a long press lifting them', () => {
		renderGroup();
		for (const tab of screen.getAllByRole('tab'))
			expect(tab.closest('[draggable]')!.getAttribute('draggable')).toBe('true');
	});

	it('are off with disableDragAndDrop', () => {
		render(LayoutHarness, {
			props: {
				config: { root: { tabs: ['a', 'b'], activeTabIndex: 0 } },
				ids: ['a', 'b'],
				disableDragAndDrop: true
			}
		});
		for (const tab of screen.getAllByRole('tab'))
			expect(tab.closest('[draggable]')!.getAttribute('draggable')).toBe('false');
	});

	it('leave a docked tab bar to the browser’s own touch handling', () => {
		renderGroup();
		const tabs = document.querySelector<HTMLElement>('.horizon-layout-tabgroup__tabs')!;
		expect(tabs.style.touchAction).toBe('');
		expect(tabs.parentElement!.style.touchAction).toBe('');
	});

	it('keep a tab from being selected as text or panned, in every engine, in the default theme', () => {
		const tab = ruleOf('.horizon-layout-tabgroup__tab');
		expect(tab).toContain('-webkit-user-select: none;');
		expect(tab).toContain('\tuser-select: none;');
		expect(tab).toContain('touch-action: none;');
	});
});
