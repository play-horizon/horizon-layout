/**
 * A stand-in for the `DataTransfer` jsdom lacks, with what a tab drag uses: the effects, the drag
 * image, and the data set on it (kept in `data`, so a test can read it back).
 * @module
 */

/** A fake `DataTransfer`, to pass as `{ dataTransfer }` to a drag event of the testing library. */
export function fakeDataTransfer() {
	const data = new Map<string, string>();
	return {
		data,
		dropEffect: 'none',
		effectAllowed: 'none',
		setDragImage: () => {},
		setData: (format: string, value: string) => void data.set(format, value)
	};
}
