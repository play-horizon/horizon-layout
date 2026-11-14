/**
 * Component tests of floating groups, rendered in jsdom through `LayoutHarness` (src/test): where
 * they are shown, moving and resizing them with the keyboard and the pointer, their stacking
 * order, and docking their tabs back with the keyboard.
 * @module
 */
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import LayoutHarness from '../test/LayoutHarness.svelte';
import { release, stubPointerCapture } from '../test/pointer-capture.ts';
import { resizeAll, setSize } from '../test/setup.ts';
import type { FloatingGroupConfig, LayoutConfig, SplitConfig, TabGroupConfig } from './types.ts';

stubPointerCapture();

function docked(): LayoutConfig['root'] {
	return {
		direction: 'horizontal',
		views: [
			{ tabs: ['a', 'b'], activeTabIndex: 0 },
			{ tabs: ['c'], activeTabIndex: 0 }
		],
		splitPoints: [0.5]
	};
}

function floating(id: string, x = 100, y = 50): FloatingGroupConfig {
	return { tabs: [id], activeTabIndex: 0, rect: { x, y, width: 300, height: 200 } };
}

/** Renders the harness in a 1000 × 800 layout, with a config held in `$state`, and returns it. */
function renderLayout(initial: LayoutConfig) {
	const state = $state({ config: initial });
	const { container } = render(LayoutHarness, {
		props: {
			get config() {
				return state.config;
			},
			set config(value) {
				state.config = value;
			},
			ids: ['a', 'b', 'c', 'd', 'e']
		}
	});
	setSize(container.querySelector('.horizon-layout')!, 1000, 800);
	resizeAll();
	flushSync();
	return state;
}

function frame(id: string) {
	return screen.getByRole('dialog', { name: `Title of ${id}, floating` });
}

function tabBarOf(id: string) {
	return frame(id).querySelector('.horizon-layout-tabgroup__tab-bar')!;
}

/** Moves pointer `pointerId`, its primary button held, to (x, y), over `element`. */
function moveTo(element: Element, pointerId: number, x: number, y: number) {
	return fireEvent.pointerMove(element, { pointerId, buttons: 1, clientX: x, clientY: y });
}

function rectOf(state: { config: LayoutConfig }, index = 0) {
	return state.config.floating![index]!.rect;
}

describe('floating groups', () => {
	it('are shown over the layout, moved back inside it', () => {
		renderLayout({ root: docked(), floating: [floating('d', 900, -10)] });
		const element = frame('d');
		expect([element.style.left, element.style.top, element.style.width]).toEqual([
			'700px',
			'0px',
			'300px'
		]);
		expect(within(element).getByText('Body of d')).toBeTruthy();
	});

	it('are hidden while a view is maximized', () => {
		renderLayout({ root: docked(), floating: [floating('d')], maximizedView: 'a' });
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('move and resize with the keys pressed on their frame', async () => {
		const state = renderLayout({ root: docked(), floating: [floating('d')] });
		const element = frame('d');

		await fireEvent.keyDown(element, { key: 'ArrowRight' });
		expect(rectOf(state)).toEqual({ x: 110, y: 50, width: 300, height: 200 });
		await fireEvent.keyDown(element, { key: 'ArrowDown', shiftKey: true });
		expect(rectOf(state)).toEqual({ x: 110, y: 100, width: 300, height: 200 });
		await fireEvent.keyDown(element, { key: 'ArrowRight', altKey: true });
		expect(rectOf(state)).toEqual({ x: 110, y: 100, width: 310, height: 200 });
		await fireEvent.keyDown(element, { key: 'ArrowUp', altKey: true, shiftKey: true });
		expect(rectOf(state)).toEqual({ x: 110, y: 100, width: 310, height: 150 });
	});

	it('leave the keys pressed in their tab list to the tab list', async () => {
		const state = renderLayout({
			floating: [{ ...floating('d'), tabs: ['d', 'e'] }]
		});
		await fireEvent.keyDown(within(frame('d')).getByRole('tablist'), { key: 'ArrowRight' });
		expect(rectOf(state)).toEqual({ x: 100, y: 50, width: 300, height: 200 });
		expect(state.config.floating![0]!.activeTabIndex).toBe(1);
	});

	it('move by dragging their tab bar, until the pointer is released', async () => {
		const state = renderLayout({ root: docked(), floating: [floating('d')] });
		const tabBar = tabBarOf('d');

		await fireEvent.pointerDown(tabBar, { button: 0, pointerId: 1, clientX: 200, clientY: 60 });
		expect(tabBar.hasPointerCapture(1)).toBe(true);
		await moveTo(tabBar, 1, 250, 80);
		expect(rectOf(state)).toEqual({ x: 150, y: 70, width: 300, height: 200 });
		await release(tabBar, 1);
		await moveTo(tabBar, 1, 400, 400);
		expect(rectOf(state)).toEqual({ x: 150, y: 70, width: 300, height: 200 });
	});

	it('stop moving at a move with no button held, after a release they missed', async () => {
		const state = renderLayout({ root: docked(), floating: [floating('d')] });
		const tabBar = tabBarOf('d');

		await fireEvent.pointerDown(tabBar, { button: 0, pointerId: 1, clientX: 200, clientY: 60 });
		await fireEvent.pointerMove(tabBar, { pointerId: 1, buttons: 0, clientX: 300, clientY: 60 });
		await moveTo(tabBar, 1, 250, 80);
		expect(rectOf(state)).toEqual({ x: 100, y: 50, width: 300, height: 200 });
		expect(tabBar.hasPointerCapture(1)).toBe(false);
	});

	it('are drawn over the docked layout, whose z-indexes stay inside it', () => {
		renderLayout({ root: docked(), floating: [floating('d')] });
		const dockedContent = screen.getAllByRole('tablist')[0]!.closest('.horizon-layout__content');
		const layer = frame('d').parentElement!;

		expect((dockedContent as HTMLElement).style.isolation).toBe('isolate');
		expect(dockedContent!.classList).toContain('horizon-layout__content--docked');
		expect(layer.style.isolation).toBe('isolate');
		expect(dockedContent!.compareDocumentPosition(layer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	});

	it('keep a touch on their tab bar from panning, which would cancel the move', () => {
		renderLayout({ root: docked(), floating: [floating('d')] });
		const [docked1] = screen.getAllByRole('tablist');
		const tabList = within(frame('d')).getByRole('tablist');

		expect(tabList.style.touchAction).toBe('none');
		expect(tabList.parentElement!.style.touchAction).toBe('none');
		expect(docked1!.style.touchAction).toBe('');
	});

	it('move by the pointer last pressed with the primary button, until it is cancelled', async () => {
		const state = renderLayout({ root: docked(), floating: [floating('d')] });
		const tabBar = tabBarOf('d');

		await fireEvent.pointerDown(tabBar, { button: 2, pointerId: 1, clientX: 200, clientY: 60 });
		await moveTo(tabBar, 1, 250, 80);
		expect(rectOf(state)).toEqual({ x: 100, y: 50, width: 300, height: 200 });

		await fireEvent.pointerDown(tabBar, { button: 0, pointerId: 1, clientX: 200, clientY: 60 });
		await fireEvent.pointerDown(tabBar, { button: 0, pointerId: 2, clientX: 200, clientY: 60 });
		await moveTo(tabBar, 1, 400, 400);
		expect(rectOf(state)).toEqual({ x: 100, y: 50, width: 300, height: 200 });
		await moveTo(tabBar, 2, 210, 70);
		expect(rectOf(state)).toEqual({ x: 110, y: 60, width: 300, height: 200 });

		await fireEvent.pointerCancel(tabBar, { pointerId: 2 });
		tabBar.releasePointerCapture(2);
		await fireEvent(tabBar, new PointerEvent('lostpointercapture', { pointerId: 2 }));
		await moveTo(tabBar, 2, 250, 80);
		expect(rectOf(state)).toEqual({ x: 110, y: 60, width: 300, height: 200 });
	});

	it('stop moving when they go away in the middle of a move', async () => {
		const state = renderLayout({ root: docked(), floating: [floating('d')] });
		const tabBar = tabBarOf('d');

		await fireEvent.pointerDown(tabBar, { button: 0, pointerId: 1, clientX: 200, clientY: 60 });
		state.config.maximizedView = 'a';
		flushSync();
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(tabBar.hasPointerCapture(1)).toBe(false);
		await moveTo(tabBar, 1, 250, 80);
		expect(rectOf(state)).toEqual({ x: 100, y: 50, width: 300, height: 200 });
	});

	it('don’t move when the press is on a tab', async () => {
		const state = renderLayout({ root: docked(), floating: [floating('d')] });
		const tab = within(frame('d')).getByRole('tab');

		await fireEvent.pointerDown(tab, { button: 0, pointerId: 1, clientX: 200, clientY: 60 });
		await moveTo(tab, 1, 250, 80);
		expect(rectOf(state)).toEqual({ x: 100, y: 50, width: 300, height: 200 });
	});

	it('resize by dragging an edge or a corner', async () => {
		const state = renderLayout({ root: docked(), floating: [floating('d')] });
		const corner = frame('d').querySelector('.horizon-layout-floating__resizer--nw')!;

		await fireEvent.pointerDown(corner, { button: 0, pointerId: 2, clientX: 100, clientY: 50 });
		await moveTo(corner, 2, 60, 70);
		await release(corner, 2);
		expect(rectOf(state)).toEqual({ x: 60, y: 70, width: 340, height: 180 });
	});

	it('come to the top when pressed', async () => {
		const state = renderLayout({ floating: [floating('d'), floating('e')] });
		expect(frame('d').style.zIndex).toBe('1');

		const [first, second] = [frame('d'), frame('e')];
		await fireEvent.pointerDown(first, { button: 0, pointerId: 1 });
		expect(state.config.floating!.map((group) => group.tabs[0])).toEqual(['e', 'd']);
		expect([first.style.zIndex, second.style.zIndex]).toEqual(['2', '1']);
		// Raised in place: the elements keep their order, so nothing inside them reloads.
		expect(frame('d')).toBe(first);
		expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('come to the top when one of their tabs is pressed', async () => {
		const state = renderLayout({ floating: [floating('d'), floating('e')] });
		await fireEvent.pointerDown(within(frame('d')).getByRole('tab'), { button: 0, pointerId: 1 });
		expect(state.config.floating!.map((group) => group.tabs[0])).toEqual(['e', 'd']);
	});

	it('are shown above the others while focus is inside them', async () => {
		renderLayout({ floating: [floating('d'), floating('e')] });

		await fireEvent.focusIn(within(frame('d')).getByRole('tablist'));
		expect([frame('d').style.zIndex, frame('e').style.zIndex]).toEqual(['3', '2']);
		await fireEvent.focusOut(within(frame('d')).getByRole('tablist'), {
			relatedTarget: frame('d')
		});
		expect(frame('d').style.zIndex).toBe('3');
		await fireEvent.focusOut(frame('d'), { relatedTarget: frame('e') });
		expect(frame('d').style.zIndex).toBe('1');
	});

	it('dock their active tab into the first docked group with Ctrl+Home, focus following', async () => {
		const state = renderLayout({ root: docked(), floating: [floating('d')] });

		await fireEvent.keyDown(within(frame('d')).getByRole('tablist'), {
			key: 'Home',
			ctrlKey: true
		});
		await tick();

		const first = (state.config.root as SplitConfig).views[0] as TabGroupConfig;
		expect(first).toEqual({ tabs: ['a', 'b', 'd'], activeTabIndex: 2 });
		expect(state.config.floating).toBeUndefined();
		expect(document.activeElement).toBe(screen.getAllByRole('tablist')[0]);
	});

	it('dock their active tab into the docked group on that side with Ctrl+Arrow', async () => {
		const state = renderLayout({
			root: docked(),
			floating: [{ ...floating('d'), tabs: ['d', 'e'] }]
		});

		await fireEvent.keyDown(within(frame('d')).getByRole('tablist'), {
			key: 'ArrowRight',
			ctrlKey: true
		});

		expect((state.config.root as SplitConfig).views[1]).toEqual({
			tabs: ['c', 'd'],
			activeTabIndex: 1
		});
		expect(state.config.floating).toEqual([floating('e')]);
	});

	it('dock their active tab as a new pane on that side with Alt+Arrow', async () => {
		const state = renderLayout({ root: docked(), floating: [floating('d')] });

		await fireEvent.keyDown(within(frame('d')).getByRole('tablist'), {
			key: 'ArrowLeft',
			altKey: true
		});

		expect(state.config.root).toEqual({
			direction: 'horizontal',
			views: [
				{ tabs: ['d'], activeTabIndex: 0 },
				{ tabs: ['a', 'b'], activeTabIndex: 0 },
				{ tabs: ['c'], activeTabIndex: 0 }
			],
			splitPoints: [0.25, 0.5]
		});
	});

	it('dock around the whole layout when it runs along the other axis', async () => {
		const state = renderLayout({ root: docked(), floating: [floating('d')] });

		await fireEvent.keyDown(within(frame('d')).getByRole('tablist'), {
			key: 'ArrowDown',
			altKey: true
		});

		expect(state.config.root).toEqual({
			direction: 'vertical',
			views: [docked(), { tabs: ['d'], activeTabIndex: 0 }],
			splitPoints: [0.5]
		});
	});

	it('become the docked layout when nothing is docked', async () => {
		const state = renderLayout({ floating: [floating('d')] });

		await fireEvent.keyDown(within(frame('d')).getByRole('tablist'), {
			key: 'End',
			ctrlKey: true
		});

		expect(state.config).toEqual({ root: { tabs: ['d'], activeTabIndex: 0 } });
	});
});
