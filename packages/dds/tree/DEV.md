# Developer Notes

## Tree

### PlainText string-storage prototype

You can opt into the experiment with `ForestTypeStringPrototype` from
`src/shared-tree/forestTypeStringPrototype.ts` (compiled to `lib/shared-tree/forestTypeStringPrototype.js`).
This is a source-level experiment, not a supported package export.
Pass it as the `forest` option to `createIndependentTreeAlpha` or `configuredSharedTree`.
Use `ForestTypeOptimized` for the baseline.
No stored schema or wire-format change is required.

For packed construction and initialization, pass `PlainText.Tree.fromString` directly to the view:

```typescript
const view = createIndependentTreeAlpha({ forest: ForestTypeStringPrototype }).viewWith(
	new TreeViewConfiguration({ schema: PlainText.Tree }),
);
view.initialize(PlainText.Tree.fromString(text));
```

The forest represents eligible single-code-point string leaves as pieces of immutable buffers.
Each buffer contains at most 4096 UTF-16 code units.
Pieces share buffers when split, and contiguous pieces from the same buffer coalesce without copying.
Small pieces from different buffers can coalesce up to 256 code units.
Sparse checkpoints every 64 code points support random cursor access; sequential traversal advances a stored offset.
Separate surrogate-half leaves stay separate, even when adjacent.
Other leaf values use the existing representation.
The opt-in policy can also pack eligible string-leaf sequences outside PlainText, but does not optimize formatted-text construction or formatting.

`PlainText.insertAt` bypasses per-character MapTree preparation on this forest.
`fullString` reads piece spans; `charactersCopy` still allocates its requested character array.
`PlainText.Tree.fromString` now creates a packed unhydrated sequence.
Its ordinary text reads, inserts, deletes, and within-text moves retain pieces.
Initialization on the prototype forest preserves those pieces instead of expanding character nodes.
The public text and array objects, event listeners, and insertion anchors survive hydration.
Generic internal APIs that explicitly request unhydrated child nodes can still materialize them.
Unhydrated packing does not require selecting a forest in advance; insertion into the reference or ordinary optimized forest remains supported.
The field still uses a flat chunk array, so lookup and splicing remain linear in the number of pieces.
Delta builds still allocate per-root cursors and detached entries: this experiment does not eliminate all per-character transient work.
JavaScript engines determine whether string slices share or copy memory; the buffer-size bound is not a guarantee about engine-level backing allocations.

Run these commands from the repository root after installing dependencies:

```powershell
pnpm exec fluid-build packages\dds\tree --task build:test:esm
pnpm --dir packages\dds\tree exec mocha --grep 'StringChunk|PlainText string storage|textDomain' --reporter dot
$env:FLUID_TEST_PERF_MODE = '1'
pnpm --dir packages\dds\tree exec mocha --grep 'PlainText string storage benchmark' --reporter @fluid-tools/benchmark/dist/mocha/Reporter.js
Remove-Item Env:\FLUID_TEST_PERF_MODE
```

The paired benchmarks cover `fromString`, `fromString` plus initialization, paste, full-string reads, 100 middle insertions, and retained memory.
Factory baselines use the original unpacked construction path through the internal `plainTextFromString` benchmark switch.
Setup is outside the timed operation.
The initialization measurement includes both factory construction and `view.initialize`.
Memory measurements retain either the unhydrated text or the entire independent checkout, including edit history, and exclude the shared input string.
They are not allocation-volume or garbage-collection-pause measurements.
Use heap/allocation profiling of the same workloads to separate forest storage from remaining edit-processing costs.
The piece representation follows the approach described in [VS Code's piece-tree design](https://code.visualstudio.com/blogs/2018/03/23/text-buffer-reimplementation);
the bounded coalescing policy also draws on `merge-tree`'s `TextSegment`.
