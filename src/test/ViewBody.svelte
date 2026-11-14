<!-- @component
The body of a test view: its id as text, and one more count in `mounts` each time it is mounted,
so a test can tell whether a layout change kept a panel mounted.
-->
<script lang="ts" module>
	/** How many times the body of each view id has been mounted. */
	export const mounts = new Map<string, number>();
</script>

<script lang="ts">
	import { onMount } from 'svelte';

	let { id }: { id: string } = $props();

	onMount(() => {
		mounts.set(id, (mounts.get(id) ?? 0) + 1);
	});
</script>

<p>Body of {id}</p>
