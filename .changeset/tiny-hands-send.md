---
"@fluidframework/container-runtime": minor
---

Deprecated `refreshLatestAck` in `ISummarizeOptions`, `IOnDemandSummarizeOptions` and `IEnqueueSummarizeOptions`

Passing `refreshLatestAck` as true will result in closing the summarizer. It is not supported anymore and will be removed in a future release. It should not be passed in to `summarizeOnDemand` and `enqueueSummarize` APIs anymore.
