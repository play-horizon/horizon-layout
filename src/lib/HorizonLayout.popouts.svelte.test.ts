/**
 * Component tests of HorizonLayout's popout windows, rendered in jsdom with `window.open`
 * stubbed: opening them, closing them from the config, from the window or by unmounting, and the
 * fallback for windows the browser blocks.
 * @module
 */
import { render } from '@testing-library/svelte';
import { createRawSnippet, flushSync } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HorizonLayout from './HorizonLayout.svelte';
import type { Id, LayoutConfig, TabGroupConfig, View } from './types.ts';

/** A window `window.open` returns: a document of its own, closed by `close`. */
class FakePopup extends EventTarget {
	readonly document = document.implementation.createHTMLDocument('');
	closed = false;

	close() {
		this.closed = true;
	}
}

function view(id: Id): View {
	return {
		title: `Title of ${id}`,
		snippet: createRawSnippet(() => ({ render: () => `<p>Body of ${id}</p>` }))
	};
}

/** Renders HorizonLayout with views a, b and c and a config held in `$state`, and returns it. */
function renderLayout(
	initial: LayoutConfig,
	callbacks: { onPopoutClose?: (id: Id) => void; onPopoutBlocked?: (id: Id) => void } = {}
) {
	const state = $state({ config: initial });
	const views = new SvelteMap<Id, View>(['a', 'b', 'c'].map((id) => [id, view(id)]));
	const result = render(HorizonLayout, {
		props: {
			get config() {
				return state.config;
			},
			set config(value) {
				state.config = value;
			},
			views,
			translations: {
				resizePane: (pane: number) => `Resize pane ${pane}`,
				floatingPanel: (title: string) => `${title}, floating`
			},
			...callbacks
		}
	});
	return { state, views, unmount: result.unmount };
}

/** Has `window.open` return each of `results` in turn. */
function stubOpen(...results: (FakePopup | null)[]) {
	const open = vi.spyOn(window, 'open');
	for (const result of results) open.mockReturnValueOnce(result as Window | null);
	return open;
}

/** Lets the pending promise callbacks (the deferred popout callbacks) run. */
function settle() {
	return new Promise((resolve) => setTimeout(resolve));
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('popouts', () => {
	it('open a window per id in popouts, showing its view under its title', () => {
		const popup = new FakePopup();
		const open = stubOpen(popup);
		renderLayout({ root: { tabs: ['a'], activeTabIndex: 0 }, popouts: ['b'] });

		expect(open).toHaveBeenCalledTimes(1);
		expect(popup.document.title).toBe('Title of b');
		expect(popup.document.body.textContent).toContain('Body of b');
	});

	it('follow their view when the views change', () => {
		const popup = new FakePopup();
		stubOpen(popup);
		const { views } = renderLayout({ root: { tabs: ['a'], activeTabIndex: 0 }, popouts: ['b'] });

		views.set('b', { ...view('b'), title: 'Renamed b' });
		flushSync();

		expect(popup.document.title).toBe('Renamed b');
	});

	it('close their window when the config drops them, without calling onPopoutClose', () => {
		const popup = new FakePopup();
		stubOpen(popup);
		const onPopoutClose = vi.fn();
		const { state } = renderLayout(
			{ root: { tabs: ['a'], activeTabIndex: 0 }, popouts: ['b'] },
			{ onPopoutClose }
		);

		state.config = { root: { tabs: ['a'], activeTabIndex: 0 } };
		flushSync();

		expect(popup.closed).toBe(true);
		expect(onPopoutClose).not.toHaveBeenCalled();
	});

	it('close their window when the layout is unmounted, without calling onPopoutClose', () => {
		const popup = new FakePopup();
		stubOpen(popup);
		const onPopoutClose = vi.fn();
		const { unmount } = renderLayout(
			{ root: { tabs: ['a'], activeTabIndex: 0 }, popouts: ['b'] },
			{ onPopoutClose }
		);

		unmount();

		expect(popup.closed).toBe(true);
		expect(onPopoutClose).not.toHaveBeenCalled();
	});

	it('call onPopoutClose once the config no longer lists the window the user closed', async () => {
		const popup = new FakePopup();
		const open = stubOpen(popup);
		let seen: LayoutConfig | undefined;
		const { state } = renderLayout(
			{ root: { tabs: ['a'], activeTabIndex: 0 }, popouts: ['b'] },
			{
				onPopoutClose: (id) => {
					seen = $state.snapshot(state.config);
					(state.config.root as TabGroupConfig).tabs.push(id);
				}
			}
		);

		popup.dispatchEvent(new Event('pagehide'));
		await settle();
		flushSync();

		expect(seen).toEqual({ root: { tabs: ['a'], activeTabIndex: 0 } });
		expect(state.config).toEqual({ root: { tabs: ['a', 'b'], activeTabIndex: 0 } });
		expect(open).toHaveBeenCalledTimes(1);
	});

	it('open once the browser lets a blocked window open within 500 ms', () => {
		vi.useFakeTimers();
		const popup = new FakePopup();
		const open = stubOpen(null, null, popup);
		const { state } = renderLayout({ root: { tabs: ['a'], activeTabIndex: 0 }, popouts: ['b'] });

		vi.advanceTimersByTime(600);
		flushSync();

		expect(open).toHaveBeenCalledTimes(3);
		expect(popup.document.title).toBe('Title of b');
		expect(state.config.popouts).toEqual(['b']);
	});

	it('move a window still blocked after 500 ms into the last tab group', () => {
		vi.useFakeTimers();
		vi.spyOn(window, 'open').mockReturnValue(null);
		const { state } = renderLayout({
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['c'], activeTabIndex: 0 }
				],
				splitPoints: [0.5]
			},
			popouts: ['b']
		});

		vi.advanceTimersByTime(600);
		flushSync();

		expect(state.config).toEqual({
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['c', 'b'], activeTabIndex: 1 }
				],
				splitPoints: [0.5]
			}
		});
	});

	it('make a window still blocked after 500 ms the docked layout when nothing is docked', () => {
		vi.useFakeTimers();
		vi.spyOn(window, 'open').mockReturnValue(null);
		const { state } = renderLayout({ popouts: ['b'] });

		vi.advanceTimersByTime(600);
		flushSync();

		expect(state.config).toEqual({ root: { tabs: ['b'], activeTabIndex: 0 } });
	});

	it('call onPopoutBlocked once the config no longer lists a window still blocked', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
		vi.spyOn(window, 'open').mockReturnValue(null);
		let seen: LayoutConfig | undefined;
		const { state } = renderLayout(
			{ root: { tabs: ['a'], activeTabIndex: 0 }, popouts: ['b'] },
			{
				onPopoutBlocked: (id) => {
					seen = $state.snapshot(state.config);
					(state.config.root as TabGroupConfig).tabs.unshift(id);
				}
			}
		);

		vi.advanceTimersByTime(600);
		await settle();
		flushSync();

		expect(seen).toEqual({ root: { tabs: ['a'], activeTabIndex: 0 } });
		expect(state.config).toEqual({ root: { tabs: ['b', 'a'], activeTabIndex: 0 } });
	});
});
