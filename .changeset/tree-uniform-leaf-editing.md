---
"@fluidframework/tree": minor
"__section": tree
---
Preserve compact storage when replacing SharedTree leaf values

When configured with [ForestTypeOptimized](https://fluidframework.com/docs/api/v3/tree#foresttypeoptimized-variable),
SharedTree preserves compact storage for compatible leaf-value replacements.
This reduces editing overhead and retained memory in some workloads.

The optimization applies when editing locally, receiving edits from another client, or merging edits from a fork.
Edits that cannot preserve the existing storage layout continue to use the general editing path.
The effect depends on the document schema, workload, and environment.

#### Example measurements

Local benchmarks set `bold` from `false` to `true` across a fresh 1,000-character formatted-text document using `formatRange(0, 1000, { bold: true })`.
Each character has five formatting properties: bold, italic, underline, size, and font.
The comparison isolates these editing changes from earlier read-traversal improvements.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Local edit time | 131 ms | 104 ms | 21% less |
| Memory retained by the edited tree view | 14.77 MiB | 12.46 MiB | 16% less |
| Receive queued edits from another client | 44.2 ms | 19.4 ms | 56% less |
| Merge edits from a fork | 45.4 ms | 22.6 ms | 50% less |

Measurements use Node.js 22.23.2 and report means across two runs per implementation in an interleaved comparison.
Local edit timing excludes document initialization and result verification.
Memory figures are per document after garbage collection, including content and editing history retained by the tree view; they do not measure peak memory.

Remote-receive timing covers decoding and applying already-received edits in an in-memory test environment, excluding sender work and network delay.
Fork-merge timing excludes creating and editing the fork.
Neither incoming-edit case includes concurrent local edits on the receiver.
