/**
 * Component tests of the demo page (`+page.svelte`) in jsdom: how its controls change the main
 * layout. A popout window is an iframe's window, closed by firing its `pagehide` event.
 * @module
 */
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

/** Makes `window.open` return the window of a new iframe, and returns the iframes. */
function stubWindowOpen(): HTMLIFrameElement[] {
	const frames: HTMLIFrameElement[] = [];
	vi.spyOn(window, 'open').mockImplementation(() => {
		const frame = document.createElement('iframe');
		document.body.append(frame);
		frames.push(frame);
		return frame.contentWindow;
	});
	return frames;
}

function tabTitles(): string[] {
	return screen.getAllByRole('tab').map((tab) => tab.textContent.trim());
}

afterEach(() => {
	vi.restoreAllMocks();
	localStorage.clear();
	for (const frame of document.querySelectorAll('iframe')) frame.remove();
});

describe('demo page', () => {
	it('puts a popped-out pane back in a pane of its own when its window closes', async () => {
		const frames = stubWindowOpen();
		render(Page);
		flushSync();

		const nested = screen.getByRole('tab', { name: /Nested layout/ });
		await fireEvent.click(within(nested).getByLabelText('Pop out'));
		await tick();
		expect(tabTitles()).not.toContain('Nested layout');
		expect(frames).toHaveLength(1);

		frames[0]!.contentWindow!.dispatchEvent(new Event('pagehide'));
		await tick();
		const restored = screen.getByRole('tab', { name: /Nested layout/ });
		expect(within(restored.closest('[role="tablist"]')!).getAllByRole('tab')).toHaveLength(1);
	});

	it('keeps the nested layout mounted when another page is removed', async () => {
		render(Page);
		flushSync();
		const theme = document.querySelector<HTMLSelectElement>('#nested-theme-select')!;
		await fireEvent.change(theme, { target: { value: 'light' } });

		await fireEvent.click(screen.getByLabelText('Remove Files'));
		await tick();
		expect(document.querySelector('#nested-theme-select')).toBe(theme);
		expect(theme.value).toBe('light');
	});

	it('restores the saved state once mounted', async () => {
		localStorage.setItem(
			'horizon-layout-demo-state',
			JSON.stringify({
				persist: true,
				config: { root: { tabs: ['nested', 'page-4'], activeTabIndex: 1 } },
				pages: [
					{ id: 'nested', title: 'Nested layout', kind: 'nested', persistent: true },
					{ id: 'page-4', title: 'Page 4', kind: 'blank' }
				],
				theme: 'nord'
			})
		);
		render(Page);
		await tick();

		expect(tabTitles()).toEqual(['Nested layout', 'Page 4']);
		const save = screen.getByRole('checkbox', { name: 'Save to localStorage' }) as HTMLInputElement;
		expect(save.checked).toBe(true);
	});
});
