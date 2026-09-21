---
"@fluidframework/sea-driver": minor
"__section": fix
---
Enable automatic summaries and default client-side garbage collection for Sea service clients

Containers created or loaded with `createSeaServiceClient` now use the standard Fluid runtime's automatic summarization policy.
The elected summarizer publishes and acknowledges snapshots, including incremental summaries, that later clients can load.
Client-side garbage collection uses the standard Fluid runtime defaults and persists its state in summaries.
Sea's backend still retains stored content and scans operation history to reconstruct sequence-number mappings.