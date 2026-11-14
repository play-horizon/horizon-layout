/**
 * Unit tests of the demo's own keyboard controls (`keyboard-actions.ts`), run by calling the
 * control a key matches: docking a floating group's tab as a new pane stops at maxDepth.
 * @module
 */
import { describe, expect, it } from 'vitest';
import type { KeyboardShortcut, LayoutConfig, TabGroupConfig } from '#lib/types.js';
import type { ActionId } from './KeyboardControls.svelte';
import { buildKeyboardControls, defaultBindings } from './keyboard-actions.js';

/** Runs, on `group`, the tab-group control of `layout` that Alt+ArrowRight matches. */
function pressAltRight(config: LayoutConfig, group: TabGroupConfig, maxDepth: number) {
	// One binding changed, so the demo builds its own controls.
	const bindings: Record<ActionId, KeyboardShortcut> = {
		...defaultBindings,
		deselect: { key: 'q' }
	};
	const controls = buildKeyboardControls(bindings, {
		config,
		minWidthRatio: 0.1,
		minHeightRatio: 0.2,
		maxDepth
	});
	const control = controls.tabGroupControls!.find((candidate) =>
		candidate.shortcuts.some(
			(shortcut) => shortcut.modifier === 'alt' && shortcut.key === 'ArrowRight'
		)
	)!;
	control.action(group, new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }));
}

function twoPanesAndAFloatingGroup(): LayoutConfig {
	return {
		root: {
			direction: 'horizontal',
			views: [
				{ tabs: ['a'], activeTabIndex: 0 },
				{ tabs: ['b'], activeTabIndex: 0 }
			],
			splitPoints: [0.5]
		},
		floating: [{ tabs: ['c'], activeTabIndex: 0, rect: { x: 0, y: 0, width: 300, height: 200 } }]
	};
}

describe('the demo’s keyboard controls', () => {
	it('dock a floating tab as a new pane while maxDepth leaves room', () => {
		const config = twoPanesAndAFloatingGroup();
		pressAltRight(config, config.floating![0]!, 3);

		expect(config).toEqual({
			root: {
				direction: 'horizontal',
				views: [
					{
						direction: 'horizontal',
						views: [
							{ tabs: ['a'], activeTabIndex: 0 },
							{ tabs: ['b'], activeTabIndex: 0 }
						],
						splitPoints: [0.5]
					},
					{ tabs: ['c'], activeTabIndex: 0 }
				],
				splitPoints: [0.5]
			}
		});
	});

	it('leave a floating tab floating when docking it would go deeper than maxDepth', () => {
		const config = twoPanesAndAFloatingGroup();
		pressAltRight(config, config.floating![0]!, 2);

		expect(config).toEqual(twoPanesAndAFloatingGroup());
	});
});
