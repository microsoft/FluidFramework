# @fluidframework/test-end-to-end-tests/test/src/test/summarization

End-to-end tests that exercise **summarization** — disabling the automatic summarizer on
interactive containers, driving summaries on demand from a dedicated summarizer, inspecting
the resulting summary, and loading containers/summarizers from a specific summary.

## Writing a summarization test

If you're here to learn how to write a test that takes summaries, read
**[WritingTestsThatTakeSummaries.md](../../../WritingTestsThatTakeSummaries.md)**. It covers the
container configurations to use, how to take and inspect a summary with `summarizeNow`, how to
load from a specific `summaryVersion`, and the rules that keep these tests deterministic
(`syncSummarizer: true`, calling `ensureSynchronized()` before summarizing, closing one
summarizer before starting another, etc.).

For worked examples, see the specs in this folder — for instance
[summarizeIncrementally.spec.ts](summarizeIncrementally.spec.ts) and
[summaries.spec.ts](summaries.spec.ts) — as well as the GC tests under
[../gc/](../gc/) and [treeIncrementalSummary.spec.ts](../treeIncrementalSummary.spec.ts).
