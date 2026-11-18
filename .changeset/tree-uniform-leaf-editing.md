---
"@fluidframework/tree": minor
"fluid-framework": minor
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

Local benchmarks set `bold` from `false` to `true` across a fresh 1,000-character formatted-text document using [`formatRange(0, 1000, { bold: true })`](https://fluidframework.com/docs/api/v3/tree/formattedtext-namespace/members-interface#formatrange-methodsignature).
Each character has five formatting properties: bold, italic, underline, size, and font.
The comparison isolates these editing changes from earlier read-traversal improvements.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Local edit time | 191 ms | 147 ms | 23% less |
| Memory retained by the edited tree view | 15.12 MiB | 12.85 MiB | 15% less |
| Receive queued edits from another client | 70.4 ms | 34.4 ms | 51% less |
| Merge edits from a fork | 61.4 ms | 29.6 ms | 52% less |

Measurements use Node.js 22.23.2 and report means across two runs per implementation in an interleaved comparison.
Local edit timing excludes document initialization and result verification.
Memory figures are per document after garbage collection, including content and editing history retained by the tree view; they do not measure peak memory.

Remote-receive timing covers decoding and applying already-received edits in an in-memory test environment, excluding sender work and network delay.
Fork-merge timing excludes creating and editing the fork.
Neither incoming-edit case includes concurrent local edits on the receiver.
