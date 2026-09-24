<script lang="ts" module>
	export type RatioFormat = 'percent' | 'percentShort' | 'fraction';

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
</script>

<script lang="ts">
	import type { LayoutConfig, NodeConfig, SplitConfig } from '$lib/types.js';
	import { nodeConfigType } from '$lib/utils.js';

	// Shared config sidebar for a HorizonLayout instance: interaction toggles,
	// split constraints and the split-ratio display format.
	let {
		config,
		showSplitRatio = $bindable(),
		disableResizeSplits = $bindable(),
		disableDragAndDrop = $bindable(),
		hideTabBar = $bindable(),
		skipValidation = $bindable(),
		minWidthRatio = $bindable(),
		minHeightRatio = $bindable(),
		maxDepth = $bindable(),
		ratioFormat = $bindable()
	}: {
		config: LayoutConfig;
		showSplitRatio: boolean;
		disableResizeSplits: boolean;
		disableDragAndDrop: boolean;
		hideTabBar: boolean;
		skipValidation: boolean;
		minWidthRatio: number;
		minHeightRatio: number;
		maxDepth: number;
		ratioFormat: RatioFormat;
	} = $props();

	let notice = $state('');

	// Changing the min ratios can invalidate existing split points; clamp them
	// back into range so the layout never enters the error state.
	function renormalizeSplitPoints() {
		if (!config.root) return;
		const walk = (node: NodeConfig) => {
			if (nodeConfigType(node) !== 'split') return;
			const split = node as SplitConfig;
			const min = split.direction === 'horizontal' ? minWidthRatio : minHeightRatio;
			const points = split.splitPoints;
			const count = points.length;
			const lo = (i: number) => (points[i - 1] ?? 0) + min;
			const hi = (i: number) => Math.min((points[i + 1] ?? 1) - min, 1 - min);

			// Forward pass: every point at least `min` after its predecessor.
			for (let i = 0; i < count; i++) {
				if (points[i]! < lo(i)) points[i] = lo(i);
			}
			// Backward pass: every point at least `min` before its successor and 1.
			for (let i = count - 1; i >= 0; i--) {
				if (points[i]! > hi(i)) points[i] = hi(i);
			}
			// The backward pass can re-break lower bounds on over-constrained input;
			// fall back to equal spacing, which is always valid when the min is
			// feasible for the split's pane count.
			const valid = points.every((p, i) => p >= lo(i) && p <= hi(i));
			for (let i = 0; i < count; i++) {
				points[i] = Number((valid ? points[i]! : (i + 1) / (count + 1)).toFixed(4));
			}

			for (const view of split.views) walk(view);
		};
		walk(config.root);
	}

	function feasibleMinRatio(value: number, direction: 'horizontal' | 'vertical'): boolean {
		if (!config.root) return true;
		let feasible = true;
		const walk = (node: NodeConfig) => {
			if (!feasible || nodeConfigType(node) !== 'split') return;
			const split = node as SplitConfig;
			if (split.direction === direction && split.views.length * value > 1) feasible = false;
			for (const view of split.views) walk(view);
		};
		walk(config.root);
		return feasible;
	}

	function onMinWidthChanged(value: number) {
		const previous = minWidthRatio;
		const clamped = Math.min(Math.max(value, 0), 0.45);
		minWidthRatio = clamped;
		if (!feasibleMinRatio(clamped, 'horizontal')) {
			notice = 'Too large: some splits could not satisfy this minimum width';
			minWidthRatio = previous;
			return;
		}
		notice = '';
		renormalizeSplitPoints();
	}

	function onMinHeightChanged(value: number) {
		const previous = minHeightRatio;
		const clamped = Math.min(Math.max(value, 0), 0.45);
		minHeightRatio = clamped;
		if (!feasibleMinRatio(clamped, 'vertical')) {
			notice = 'Too large: some splits could not satisfy this minimum height';
			minHeightRatio = previous;
			return;
		}
		notice = '';
		renormalizeSplitPoints();
	}

	function onMaxDepthChanged(value: number) {
		maxDepth = Math.round(Math.min(Math.max(value, 1), 10));
	}
</script>

<section class="lo-section">
	<h2>Interaction</h2>
	<div class="check-row">
		<label class="check">
			<input type="checkbox" bind:checked={showSplitRatio} />
			Show split ratio
		</label>
		<select class="select" aria-label="Ratio format" title="Ratio format" bind:value={ratioFormat}>
			{#each Object.entries(ratioFormats) as [id, def] (id)}
				<option value={id}>{def.label}</option>
			{/each}
		</select>
	</div>
	<label class="check">
		<input type="checkbox" bind:checked={disableResizeSplits} />
		Disable resizing splits
	</label>
	<label class="check">
		<input type="checkbox" bind:checked={disableDragAndDrop} />
		Disable drag &amp; drop
	</label>
	<label class="check">
		<input type="checkbox" bind:checked={hideTabBar} />
		Hide tab bars
	</label>
	<label class="check">
		<input type="checkbox" bind:checked={skipValidation} />
		Skip config validation
	</label>
</section>

<section class="lo-section">
	<h2>Constraints</h2>
	<label class="field">
		<span>Min width ratio</span>
		<input
			class="input"
			type="number"
			min="0"
			max="0.45"
			step="0.05"
			value={minWidthRatio}
			onchange={(e) => onMinWidthChanged(Number((e.currentTarget as HTMLInputElement).value))}
		/>
	</label>
	<label class="field">
		<span>Min height ratio</span>
		<input
			class="input"
			type="number"
			min="0"
			max="0.45"
			step="0.05"
			value={minHeightRatio}
			onchange={(e) => onMinHeightChanged(Number((e.currentTarget as HTMLInputElement).value))}
		/>
	</label>
	<label class="field">
		<span>Max split depth</span>
		<input
			class="input"
			type="number"
			min="1"
			max="10"
			step="1"
			value={maxDepth}
			onchange={(e) => onMaxDepthChanged(Number((e.currentTarget as HTMLInputElement).value))}
		/>
	</label>
	{#if notice}<p class="lo-notice">{notice}</p>{/if}
</section>

<style>
	.lo-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-bottom: 0.9rem;
		border-bottom: 1px solid var(--hl-border);
	}

	.lo-section h2 {
		margin: 0 0 0.5rem;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--hl-muted-foreground);
	}

	.check-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.check-row .check {
		flex: 1;
		min-width: 0;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.75rem;
	}

	.field {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.72rem;
		color: var(--hl-muted-foreground);
	}

	.input {
		width: 4.5rem;
		font-size: 0.72rem;
		padding: 0.15rem 0.3rem;
		border-radius: 0.35rem;
		border: 1px solid var(--hl-border);
		background: var(--hl-card);
		color: var(--hl-foreground);
	}

	.select {
		font-size: 0.75rem;
		padding: 0.25rem 0.45rem;
		border-radius: 0.4rem;
		border: 1px solid var(--hl-border);
		background: var(--hl-card);
		color: var(--hl-foreground);
	}

	.lo-notice {
		margin: 0;
		font-size: 0.7rem;
		color: oklch(0.72 0.15 85);
	}
</style>
