<!-- @component
The content of a popout window: one view, mounted by HorizonLayout into the window's document,
which it keeps titled after the view.
-->
<script lang="ts">
	import type { View } from './types.ts';

	let {
		popout,
		title,
		view,
		baseClass
	}: {
		/** The popout window this content is mounted in. */
		popout: Window;
		/** The window's title: the view's title. */
		title: string;
		/** The view shown in the window. */
		view: View;
		/** The layout's `baseClass`, which the root element takes, with `__popout`. */
		baseClass: string;
	} = $props();

	$effect(() => {
		popout.document.title = title;
	});
</script>

<main class="{baseClass} {baseClass}__popout">
	<div class="{baseClass}__content">
		{@render view.snippet()}
	</div>
</main>
