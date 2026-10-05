export type RatioFormat = 'percent' | 'percentShort' | 'fraction';

/** Ways the demo can display split ratios, for the `formatRatio` props. */
export const ratioFormats = {
	percent: {
		label: '50.00%',
		format: (ratio: number) => `${(ratio * 100).toFixed(2)}%`,
		aria: (ratio: number) => Number((ratio * 100).toFixed(2))
	},
	percentShort: {
		label: '50%',
		format: (ratio: number) => `${Math.round(ratio * 100)}%`,
		aria: (ratio: number) => Math.round(ratio * 100)
	},
	fraction: {
		label: '0.50',
		format: (ratio: number) => ratio.toFixed(2),
		aria: (ratio: number) => Number((ratio * 100).toFixed(2))
	}
} as const;
