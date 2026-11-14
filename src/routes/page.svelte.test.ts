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
	vi.useRealTimers();
	vi.restoreAllMocks();
	localStorage.clear();
	for (const frame of document.querySelectorAll('iframe')) frame.remove();
});

describe('demo page', () => {
	it('puts a popped-out pane back in a pane of its own when its window closes', async () => {
		const frames = stubWindowOpen();
		render(Page);
		flushSync();

		const controls = screen.getByRole('group', { name: 'Nested layout' });
		await fireEvent.click(within(controls).getByRole('button', { name: 'Pop out' }));
		await tick();
		expect(tabTitles()).not.toContain('Nested layout');
		expect(frames).toHaveLength(1);

		frames[0]!.contentWindow!.dispatchEvent(new Event('pagehide'));
		await tick();
		const restored = screen.getByRole('tab', { name: 'Nested layout' });
		const tabs = restored.closest('.horizon-layout-tabgroup__tabs')!;
		expect(within(tabs as HTMLElement).getAllByRole('tab')).toHaveLength(1);
	});

	it('keeps the nested layout mounted when another page is removed', async () => {
		render(Page);
		flushSync();
		const theme = screen.getByRole('combobox', {
			name: 'Nested layout theme'
		}) as HTMLSelectElement;
		await fireEvent.change(theme, { target: { value: 'light' } });

		await fireEvent.click(screen.getByLabelText('Remove Files'));
		await tick();
		expect(screen.getByRole('combobox', { name: 'Nested layout theme' })).toBe(theme);
		expect(theme.value).toBe('light');
	});

	it('resets the constraints with the layout, which they could make invalid', async () => {
		render(Page);
		// The sidebar's fields come first; the nested layout's page has fields of its own.
		const minWidth = screen.getAllByLabelText('Min width ratio')[0] as HTMLInputElement;
		const maxDepth = screen.getAllByLabelText('Max split depth')[0] as HTMLInputElement;
		await fireEvent.change(minWidth, { target: { value: '0.3' } });
		await fireEvent.change(maxDepth, { target: { value: '9' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }));
		flushSync();

		expect(minWidth.value).toBe('0.1');
		expect(maxDepth.value).toBe('6');
		expect(screen.getAllByRole('tablist').length).toBeGreaterThan(0);
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
		expect((screen.getByRole('combobox', { name: 'Theme' }) as HTMLSelectElement).value).toBe(
			'nord'
		);
	});

	it('saves the state while saving is on, and forgets it when turned off', async () => {
		vi.useFakeTimers();
		render(Page);
		const save = screen.getByRole('checkbox', { name: 'Save to localStorage' });

		await fireEvent.click(save);
		await vi.advanceTimersByTimeAsync(250);
		const saved = JSON.parse(localStorage.getItem('horizon-layout-demo-state')!);
		expect(saved.persist).toBe(true);
		expect(saved.theme).toBe('dark');

		await fireEvent.click(screen.getByLabelText('Remove Usage'));
		await fireEvent.click(save);
		await vi.advanceTimersByTimeAsync(250);
		expect(localStorage.getItem('horizon-layout-demo-state')).toBeNull();
	});
});
