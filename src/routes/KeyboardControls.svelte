<script lang="ts" module>
	import type { KeyboardShortcut, Modifier } from '$lib/types.js';

	// Which internal action the shortcut maps onto.
	export type ActionId =
		| 'deselect'
		| 'cycleNext'
		| 'cyclePrev'
		| 'moveTabNext'
		| 'moveTabPrev'
		| 'splitRight'
		| 'splitLeft'
		| 'splitUp'
		| 'splitDown'
		| 'moveNextPane'
		| 'movePrevPane'
		| 'resizeBigger'
		| 'resizeSmaller'
		| 'resizeMin'
		| 'resizeMax';

	export const actionLabels: Record<ActionId, string> = {
		deselect: 'Deselect',
		cycleNext: 'Select next tab',
		cyclePrev: 'Select previous tab',
		moveTabNext: 'Move tab right',
		moveTabPrev: 'Move tab left',
		splitRight: 'Split pane right',
		splitLeft: 'Split pane left',
		splitUp: 'Split pane up',
		splitDown: 'Split pane down',
		moveNextPane: 'Move tab to right pane',
		movePrevPane: 'Move tab to left pane',
		resizeBigger: 'Increase pane size',
		resizeSmaller: 'Decrease pane size',
		resizeMin: 'Resize pane to minimum',
		resizeMax: 'Resize pane to maximum'
	};

	export const modifiers: (Modifier | '')[] = [
		'',
		'ctrl',
		'shift',
		'alt',
		'ctrl+shift',
		'ctrl+alt',
		'alt+shift',
		'ctrl+alt+shift'
	];
</script>

<script lang="ts">
	type Binding = { modifier: string; key: string };

	let {
		bindings,
		onChanged
	}: {
		/** Current bindings per action (first shortcut only). */
		bindings: Partial<Record<ActionId, KeyboardShortcut>>;
		onChanged: (action: ActionId, binding: Binding) => void;
	} = $props();

	const actions = Object.keys(actionLabels) as ActionId[];
</script>

<div class="kbd-list">
	{#each actions as action (action)}
		{@const current = bindings[action]}
		{#if current}
			<div class="kbd-row">
				<span class="kbd-label">{actionLabels[action]}</span>
				<div class="kbd-controls">
					<select
						class="kbd-select"
						aria-label="Modifier for {actionLabels[action]}"
						value={current.modifier ?? ''}
						onchange={(e) =>
							onChanged(action, {
								modifier: (e.currentTarget as HTMLSelectElement).value,
								key: current.key
							})}
					>
						{#each modifiers as mod (mod)}
							<option value={mod}>{mod === '' ? 'none' : mod}</option>
						{/each}
					</select>
					<input
						class="kbd-input"
						type="text"
						aria-label="Key for {actionLabels[action]}"
						value={current.key}
						onchange={(e) =>
							onChanged(action, {
								modifier: current.modifier ?? '',
								key: (e.currentTarget as HTMLInputElement).value
							})}
					/>
				</div>
			</div>
		{/if}
	{/each}
</div>

<style>
	.kbd-list {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.kbd-row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.kbd-label {
		font-size: 0.72rem;
		color: var(--hl-foreground);
	}

	.kbd-controls {
		display: flex;
		gap: 0.3rem;
	}

	.kbd-select {
		font-size: 0.7rem;
		padding: 0.1rem 0.25rem;
		border-radius: 6px;
		border: 1px solid var(--hl-border);
		background: var(--hl-card);
		color: var(--hl-foreground);
		flex: 0 0 auto;
	}

	.kbd-input {
		flex: 1;
		min-width: 0;
		font-size: 0.7rem;
		padding: 0.1rem 0.3rem;
		border-radius: 6px;
		border: 1px solid var(--hl-border);
		background: var(--hl-card);
		color: var(--hl-foreground);
	}
</style>
