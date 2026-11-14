/**
 * Pointer capture for the component tests, which jsdom lacks: `stubPointerCapture` installs
 * `setPointerCapture`, `hasPointerCapture` and `releasePointerCapture` for the tests of a file,
 * and `release` ends a gesture as a browser does.
 * @module
 */
import { fireEvent } from '@testing-library/svelte';
import { afterAll, beforeAll } from 'vitest';

const captures = new WeakMap<Element, Set<number>>();

function capturedBy(element: Element): Set<number> {
	let set = captures.get(element);
	if (!set) {
		set = new Set();
		captures.set(element, set);
	}
	return set;
}

/** Installs pointer capture on every element for the tests of the calling file. */
export function stubPointerCapture(): void {
	beforeAll(() => {
		Object.assign(Element.prototype, {
			setPointerCapture(this: Element, pointerId: number) {
				capturedBy(this).add(pointerId);
			},
			hasPointerCapture(this: Element, pointerId: number) {
				return capturedBy(this).has(pointerId);
			},
			releasePointerCapture(this: Element, pointerId: number) {
				capturedBy(this).delete(pointerId);
			}
		});
	});

	afterAll(() => {
		const prototype: Partial<Element> = Element.prototype;
		delete prototype.setPointerCapture;
		delete prototype.hasPointerCapture;
		delete prototype.releasePointerCapture;
	});
}

/** Ends a pointer gesture on `element` as a browser does: pointerup, then the capture's loss. */
export async function release(element: Element, pointerId: number): Promise<void> {
	await fireEvent.pointerUp(element, { pointerId });
	element.releasePointerCapture(pointerId);
	await fireEvent(element, new PointerEvent('lostpointercapture', { pointerId }));
}
