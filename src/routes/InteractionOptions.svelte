<script lang="ts">
	import { ratioFormats } from './LayoutOptions.svelte';
	import type { RatioFormat } from './LayoutOptions.svelte';

	// Interaction toggles for a HorizonLayout instance, without the constraint
	// fields — lets layouts place interaction and constraints in separate
	// columns.
	let {
		showSplitRatio = $bindable(),
		disableResizeSplits = $bindable(),
		disableDragAndDrop = $bindable(),
		hideTabBar = $bindable(),
		skipValidation = $bindable(),
		ratioFormat = $bindable()
	}: {
		showSplitRatio: boolean;
		disableResizeSplits: boolean;
		disableDragAndDrop: boolean;
		hideTabBar: boolean;
		skipValidation: boolean;
		ratioFormat: RatioFormat;
	} = $props();
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
		Disable drag & drop
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

	.select {
		font-size: 0.75rem;
		padding: 0.25rem 0.45rem;
		border-radius: 0.4rem;
		border: 1px solid var(--hl-border);
		background: var(--hl-card);
		color: var(--hl-foreground);
	}
</style>
