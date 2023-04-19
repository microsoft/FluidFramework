<script>
  import { onDestroy, onMount } from 'svelte';
  import { getTinyliciousContainer } from './util/getTinyliciousContainer';
  import { fluidWritable } from './util/fluidWritable';

  let text = "";
  let syncedText;

  onMount(async () => {
    const container = await getTinyliciousContainer();
    syncedText = fluidWritable(container);
    syncedText.subscribe((value) => {
      text = value;
    });
  });

  function updateText() {
    syncedText.set(text);
  }
</script>

<textarea bind:value={text} on:input={updateText}></textarea>
{$syncedText}
