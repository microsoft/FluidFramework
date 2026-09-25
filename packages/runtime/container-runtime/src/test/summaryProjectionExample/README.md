# Application summary projection sample

This sample shows how an application can register a callback that contributes an application-owned subtree to the container summary root.
It focuses on incremental reuse: unchanged projected content can be emitted as `ISummaryHandle` entries instead of re-uploading the same blobs.

## API contract

- `key`: a single summary-root path segment chosen by the application.
- `summarize(context)`: called during ordinary container summarization.
- Return `{ summary, onAccepted? }` where `summary` is an `ISummaryTree`.
- Handles are only valid when `context.fullTree === false` and `context.previousSummary` is defined.
- `onAccepted` is called only after the matching submitted summary is acknowledged and adopted.
  That is the safe point to promote any local state used to decide whether future summaries can reuse handles.

## Usage snippet

```ts
const sample = new TwoBlobApplicationSummaryProjectionSample({ left: "A", right: "B" });
const { runtime } = await ContainerRuntime.loadRuntime2({
  context,
  registry,
  existing,
  provideEntryPoint,
  applicationSummaryProjection: sample.projection,
});
```

The sample projects two blobs under `appProjection/left` and `appProjection/right`.
If only one side changes between accepted summaries, the unchanged side is emitted as a handle to the prior summary path.

## Sample vs. test code

`projectionSample.ts` is the reusable consumer-facing example.
It is deliberately written as code a real application can copy and adapt.

`projectionExample.spec.ts` is only test harness code.
It drives the sample through generate/submit/ack cycles and verifies handle reuse behavior.
