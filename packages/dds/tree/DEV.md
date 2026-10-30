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

The storage model in `src/util/stringStorage.ts` represents string atoms as pieces of immutable buffers.
It has no tree, schema, cursor, or forest dependencies.
`StringPiece` holds an immutable range; `StringSequence` holds an immutable list of pieces.
The unhydrated field and forest use separate adapters over this shared storage.
`LeafSequence` describes primitive leaves without child identities or defaults.
`StringChunk` adapts string pieces to the chunked forest.
Each buffer contains at most 4096 UTF-16 code units.
Pieces share buffers when split, and contiguous pieces from the same buffer coalesce without copying.
Small pieces from different buffers can coalesce up to 256 code units.
Sparse checkpoints every 64 code points support random cursor access; sequential traversal advances a stored offset.
Separate surrogate-half leaves stay separate, even when adjacent.
Other leaf values use the existing representation.
The opt-in policy can also pack eligible string-leaf sequences outside PlainText, but does not optimize formatted-text construction or formatting.
The chunker converts directly encountered character leaves and reuses existing container chunks.
It does not scan those containers to find more text.
This preserves chunk reuse for numeric maps and other existing subtrees.

Automatic repacking of nested text decoded from older formats is outside this prototype.
Old-format summaries and remote inserts of non-empty text subtrees remain supported, but their text can stay unpacked.
Direct remote character inserts can still be packed when their leaves reach the chunker.
The persisted-format follow-up must verify that its decoder produces packed text for remote inserts and summaries.
Avoiding a decoded node allocation for each character belongs in that batch or run decoder, not in repeated container conversion.

`PlainText.insertAt` supplies a primitive field cursor instead of preparing a MapTree for each character.
The destination forest chooses its representation; only the prototype forest adopts string pieces.
`fullString` reads piece spans; `charactersCopy` still allocates its requested character array.
`PlainText.Tree.fromString` now creates a packed unhydrated sequence.
Its ordinary text reads, inserts, deletes, and within-text moves retain pieces.
Unhydrated `characters()` advances a sequential iterator instead of searching for each character from the first piece.
It observes edits between yields and switches to the hydrated field if hydration occurs.
Initialization on the prototype forest preserves those pieces instead of expanding character nodes.
The public text and array objects, event listeners, and insertion anchors survive hydration.
Generic internal APIs that explicitly request unhydrated child nodes can still materialize them.
MapTree cursors delegate primitive field traversal without materializing those nodes.
This avoids whole-node chunk snapshots and ancestor snapshot invalidation during hydration.
Unhydrated packing does not require selecting a forest in advance; insertion into the reference or ordinary optimized forest remains supported.
The field still uses a flat chunk array, so lookup and splicing remain linear in the number of pieces.
Delta builds still allocate per-root cursors and detached entries: this experiment does not eliminate all per-character transient work.
JavaScript engines determine whether string slices share or copy memory; the buffer-size bound is not a guarantee about engine-level backing allocations.

Run these commands from the repository root after installing dependencies:

```powershell
pnpm exec fluid-build packages\dds\tree --task build:test:esm
pnpm --dir packages\dds\tree exec mocha --grep 'forest-independent string storage|primitive leaf sequence cursors|StringChunk|PlainText string storage|textDomain' --reporter dot
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
