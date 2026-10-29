---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-utils": minor
"__section": deprecation
---
Deprecate summarizer implementation APIs

Direct summarizer control, detailed summarizer results, and summary collection APIs from `@fluidframework/container-runtime` are deprecated.
These APIs expose implementation details and are intended to become internal.
The following APIs are deprecated:

- Direct control: `ISummarizer`, `ISummarizeOptions`, `IOnDemandSummarizeOptions`, and `ISummarizeResults`.
- Enqueue support: `IEnqueueSummarizeOptions` and `EnqueueSummarizeResult`.
- Result stages: `SummarizeResultPart`, `SubmitSummaryResult`, `IBaseSummarizeResult`, `IGenerateSummaryTreeResult`, `IUploadSummaryResult`, `ISubmitSummaryOpResult`, `SubmitSummaryFailureData`, and `SummaryStage`.
- Result metadata and acknowledgements: `IRetriableFailureError`, `IGeneratedSummaryStats`, `IBroadcastSummaryResult`, `IAckSummaryResult`, and `INackSummaryResult`.
- Collection and message wrappers: `SummaryCollection`, `ISummary`, `IAckedSummary`, `ISummaryOpMessage`, `ISummaryAckMessage`, and `ISummaryNackMessage`.
- Collection watchers and events: `IClientSummaryWatcher`, `ISummaryCollectionOpEvents`, `OpActionEventName`, and `OpActionEventListener`.

For application-requested summaries, use the loader API:

```typescript
import { loadSummarizerContainerAndMakeSummary } from "@fluidframework/container-loader/legacy";
```

The loader API reports summary submission and broadcast results.
It does not provide equivalent enqueueing, collection watching, detailed stage promises, or acknowledgement results.
Its success result does not guarantee that the summary has been acknowledged, and its returned handle is not guaranteed to be an acknowledged snapshot version.

`SummaryTreeBuilder` and `convertToSummaryTreeWithStats` from `@fluidframework/runtime-utils` are also deprecated as implementation utilities intended to become internal.
There is no supported replacement for these tree-building and conversion utilities.
The loader API is not a replacement for building summary trees.

This change preserves existing exports, signatures, and behavior.
Internal implementations in the Fluid Framework repository can continue using these APIs.
No internalization version or date is specified.
See [AB#88250](https://dev.azure.com/fluidframework/internal/_workitems/edit/88250) for tracking.
