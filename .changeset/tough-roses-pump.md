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

For application-requested summaries, use `loadAndSummarize` from `@fluidframework/container-loader/legacy`.
This is the recommended migration API for most customers:

```typescript
import { loadAndSummarize } from "@fluidframework/container-loader/legacy";

// props supplies the loader services and request.
const { version, referenceSequenceNumber } = await loadAndSummarize(props);
```

`loadAndSummarize` manages loading and disposing the summarizer container and requests an on-demand summary without requiring the application to manage summarizer implementation details.
It waits for service acknowledgement and returns the acknowledged snapshot version and the reference sequence number of its summary proposal.
Use `version` with `LoaderHeader.version` on drivers that support loading snapshot versions.
The API rejects on failure.
Enqueueing, collection watching, and detailed stage promises are implementation-level controls that are intentionally not exposed by this API.

The older `loadSummarizerContainerAndMakeSummary` API is intended for specialized integrations that do not provide service acknowledgement ops.
Most customers should use `loadAndSummarize` instead.
The older API's success requires submission and broadcast, and its proposal handle is not guaranteed to identify an acknowledged snapshot version.

`SummaryTreeBuilder` and `convertToSummaryTreeWithStats` from `@fluidframework/runtime-utils` are also deprecated as implementation utilities intended to become internal.
There is no supported replacement for these tree-building and conversion utilities.
The loader API is not a replacement for building summary trees.

This change preserves existing exports, signatures, and behavior.
Internal implementations in the Fluid Framework repository can continue using these APIs.
No internalization version or date is specified.
