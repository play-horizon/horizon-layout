<!--
@component
The split constraints of a HorizonLayout: the minimum pane width and height and the maximum split
depth. A minimum some split can't satisfy is refused with a notice; an accepted one moves the
config's split points back into range, so the layout never shows its error state.
-->
<script lang="ts">
	import type { LayoutConfig, NodeConfig, SplitConfig } from '#lib/types.js';
	import { nodeConfigType } from '#lib/utils.js';
	import { MAX_DEPTH, MAX_MIN_RATIO, MIN_DEPTH } from './constraints.js';

	let {
		config = $bindable(),
		minWidthRatio = $bindable(),
		minHeightRatio = $bindable(),
		maxDepth = $bindable()
	}: {
		/** The layout whose split points move back into range, in place, when a minimum grows. */
		config: LayoutConfig;
		minWidthRatio: number;
		minHeightRatio: number;
		maxDepth: number;
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

	// Each handler leaves the field showing the value in effect, which differs from the typed one
	// when it was clamped or refused.
	function onMinWidthChanged(input: HTMLInputElement) {
		const value = clampRatio(Number(input.value));
		if (feasibleMinRatio(value, 'horizontal')) {
			notice = '';
			minWidthRatio = value;
			renormalizeSplitPoints();
		} else {
			notice = 'Too large: some splits could not satisfy this minimum width';
		}
		input.value = String(minWidthRatio);
	}

	function onMinHeightChanged(input: HTMLInputElement) {
		const value = clampRatio(Number(input.value));
		if (feasibleMinRatio(value, 'vertical')) {
			notice = '';
			minHeightRatio = value;
			renormalizeSplitPoints();
		} else {
			notice = 'Too large: some splits could not satisfy this minimum height';
		}
		input.value = String(minHeightRatio);
	}

	function onMaxDepthChanged(input: HTMLInputElement) {
		maxDepth = Math.round(Math.min(Math.max(Number(input.value), MIN_DEPTH), MAX_DEPTH));
		input.value = String(maxDepth);
	}

	function clampRatio(value: number): number {
		return Math.min(Math.max(value, 0), MAX_MIN_RATIO);
	}
</script>

<section class="lo-section">
	<h2>Constraints</h2>
	<label class="field">
		<span>Min width ratio</span>
		<input
			class="input"
			type="number"
			min="0"
			max={MAX_MIN_RATIO}
			step="0.05"
			value={minWidthRatio}
			onchange={(e) => onMinWidthChanged(e.currentTarget)}
		/>
	</label>
	<label class="field">
		<span>Min height ratio</span>
		<input
			class="input"
			type="number"
			min="0"
			max={MAX_MIN_RATIO}
			step="0.05"
			value={minHeightRatio}
			onchange={(e) => onMinHeightChanged(e.currentTarget)}
		/>
	</label>
	<label class="field">
		<span>Max split depth</span>
		<input
			class="input"
			type="number"
			min={MIN_DEPTH}
			max={MAX_DEPTH}
			step="1"
			value={maxDepth}
			onchange={(e) => onMaxDepthChanged(e.currentTarget)}
		/>
	</label>
	{#if notice}<p class="lo-notice" role="alert">{notice}</p>{/if}
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
		margin: 0 0 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--hl-foreground);
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

	.lo-notice {
		margin: 0;
		font-size: 0.7rem;
		color: var(--demo-warning);
	}
</style>
