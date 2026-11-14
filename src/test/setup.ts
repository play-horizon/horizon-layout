/**
 * Test setup for jsdom, which has no layout: a `ResizeObserver` that reports only when a test
 * calls `resizeAll`, after giving elements a size with `setSize` (jsdom's `clientWidth` and
 * `clientHeight` are always 0). Svelte's `bind:clientWidth` and `bind:clientHeight` read the
 * size through it.
 * @module
 */
const observers = new Set<FakeResizeObserver>();

class FakeResizeObserver implements ResizeObserver {
	readonly #callback: ResizeObserverCallback;
	readonly #targets = new Set<Element>();

	constructor(callback: ResizeObserverCallback) {
		this.#callback = callback;
		observers.add(this);
	}

	observe(target: Element) {
		this.#targets.add(target);
	}

	unobserve(target: Element) {
		this.#targets.delete(target);
	}

	disconnect() {
		this.#targets.clear();
		observers.delete(this);
	}

	notify() {
		const entries = [...this.#targets].map((target) => ({ target }) as ResizeObserverEntry);
		if (entries.length > 0) this.#callback(entries, this);
	}
}

globalThis.ResizeObserver = FakeResizeObserver;

/** Gives `element` a `clientWidth` and a `clientHeight`, reported at the next `resizeAll`. */
export function setSize(element: Element, width: number, height: number): void {
	Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
	Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
}

/** Has every observer report the current size of the elements it observes. */
export function resizeAll(): void {
	for (const observer of observers) observer.notify();
}
