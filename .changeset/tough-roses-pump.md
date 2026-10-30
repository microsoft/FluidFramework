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

The loader API manages loading and disposing the summarizer container and requests an on-demand summary without requiring the application to manage summarizer implementation details.
A successful result confirms that the summary was generated, uploaded, submitted, and its proposal broadcast was observed.
Enqueueing, collection watching, and detailed stage promises are implementation-level controls that are intentionally not exposed by this API.

The API currently completes without waiting for service acknowledgement.
Applications that need to load the newly generated summary by an acknowledged snapshot version cannot obtain that guarantee from this result; the returned handle identifies the proposed summary.

`SummaryTreeBuilder` and `convertToSummaryTreeWithStats` from `@fluidframework/runtime-utils` are also deprecated as implementation utilities intended to become internal.
There is no supported replacement for these tree-building and conversion utilities.
The loader API is not a replacement for building summary trees.

This change preserves existing exports, signatures, and behavior.
Internal implementations in the Fluid Framework repository can continue using these APIs.
No internalization version or date is specified.
