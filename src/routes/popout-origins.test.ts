/**
 * Unit tests of the demo's popout bookkeeping (`popout-origins.ts`): where a view goes back to
 * when its popout window closes.
 * @module
 */
import { describe, expect, it } from 'vitest';
import type { LayoutConfig } from '#lib/types.js';
import { PopoutOrigins } from './popout-origins.js';

const accept = () => true;

describe('PopoutOrigins', () => {
	it('puts a tab back at its index in its group, active', () => {
		const config: LayoutConfig = { root: { tabs: ['a', 'b', 'c'], activeTabIndex: 2 } };
		const origins = new PopoutOrigins();
		origins.popOut(config, 'b');
		expect(config).toEqual({ root: { tabs: ['a', 'c'], activeTabIndex: 1 }, popouts: ['b'] });

		origins.restore(config, 'b', accept);
		expect(config).toEqual({ root: { tabs: ['a', 'b', 'c'], activeTabIndex: 1 } });
	});

	it('puts a view back when the bound config already dropped it from popouts', () => {
		const config: LayoutConfig = { root: { tabs: ['a', 'b'], activeTabIndex: 0 } };
		const origins = new PopoutOrigins();
		origins.popOut(config, 'b');
		config.popouts = undefined;

		origins.restore(config, 'b', accept);
		expect(config).toEqual({ root: { tabs: ['a', 'b'], activeTabIndex: 1 } });
	});

	it('gives a last pane its own pane back, after its neighbour', () => {
		const config: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 },
					{ tabs: ['c'], activeTabIndex: 0 }
				],
				splitPoints: [0.3, 0.6]
			}
		};
		const origins = new PopoutOrigins();
		origins.popOut(config, 'c');
		expect(config).toEqual({
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 }
				],
				splitPoints: [0.3]
			},
			popouts: ['c']
		});

		origins.restore(config, 'c', accept);
		// `b` spanned 0.3 to 1; `c` takes its second half.
		expect(config).toEqual({
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 },
					{ tabs: ['c'], activeTabIndex: 0 }
				],
				splitPoints: [0.3, 0.65]
			}
		});
	});

	it('gives a first pane its own pane back when its split collapsed', () => {
		const config: LayoutConfig = {
			root: {
				direction: 'vertical',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 }
				],
				splitPoints: [0.25]
			}
		};
		const origins = new PopoutOrigins();
		origins.popOut(config, 'a');
		expect(config).toEqual({ root: { tabs: ['b'], activeTabIndex: 0 }, popouts: ['a'] });

		origins.restore(config, 'a', accept);
		expect(config).toEqual({
			root: {
				direction: 'vertical',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 }
				],
				splitPoints: [0.5]
			}
		});
	});

	it("makes the view a tab of its neighbour's group when its own pane isn't valid", () => {
		const config: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a'], activeTabIndex: 0 },
					{ tabs: ['b'], activeTabIndex: 0 }
				],
				splitPoints: [0.5]
			}
		};
		const origins = new PopoutOrigins();
		origins.popOut(config, 'b');

		origins.restore(config, 'b', () => false);
		expect(config).toEqual({ root: { tabs: ['a', 'b'], activeTabIndex: 1 } });
	});

	it('floats a floating view again at the same place', () => {
		const rect = { x: 10, y: 20, width: 300, height: 200 };
		const config: LayoutConfig = {
			root: { tabs: ['a'], activeTabIndex: 0 },
			floating: [{ tabs: ['f'], activeTabIndex: 0, rect }]
		};
		const origins = new PopoutOrigins();
		origins.popOut(config, 'f');
		expect(config).toEqual({ root: { tabs: ['a'], activeTabIndex: 0 }, popouts: ['f'] });

		origins.restore(config, 'f', accept);
		expect(config).toEqual({
			root: { tabs: ['a'], activeTabIndex: 0 },
			floating: [
				{ tabs: ['f'], activeTabIndex: 0, rect: { x: 10, y: 20, width: 300, height: 200 } }
			]
		});
	});

	it('puts the view last in the layout when its neighbour is gone', () => {
		const config: LayoutConfig = {
			root: {
				direction: 'horizontal',
				views: [
					{ tabs: ['a', 'b'], activeTabIndex: 0 },
					{ tabs: ['c'], activeTabIndex: 0 }
				],
				splitPoints: [0.5]
			}
		};
		const origins = new PopoutOrigins();
		origins.popOut(config, 'b');
		config.root = { tabs: ['c'], activeTabIndex: 0 };

		origins.restore(config, 'b', accept);
		expect(config).toEqual({ root: { tabs: ['c', 'b'], activeTabIndex: 1 } });
	});

	it('docks a view it never popped out, such as a popout of a restored layout', () => {
		const config: LayoutConfig = { popouts: ['x'] };

		new PopoutOrigins().restore(config, 'x', accept);
		expect(config).toEqual({ root: { tabs: ['x'], activeTabIndex: 0 } });
	});

	it('ignores a view that is already popped out', () => {
		const config: LayoutConfig = { root: { tabs: ['a'], activeTabIndex: 0 }, popouts: ['b'] };

		new PopoutOrigins().popOut(config, 'b');
		expect(config).toEqual({ root: { tabs: ['a'], activeTabIndex: 0 }, popouts: ['b'] });
	});
});
