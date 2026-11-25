# @fluidframework/test-end-to-end-tests/test/src/test/benchmark

There are 2 different types of end-to-end benchmark tests for collecting both memory and time data:

## Example1

Take a look at the [SimpleTest.all.spec.ts](src/test/benchmark/SimpleTest.all.spec.ts) for a basic example
of how to write an end-to-end test that will collect performance data for both time and memory.

## Example2

The tests that make use of `describeE2EDocRun` will automatically run against a predetermined number of documents.
To illustrate, take a look at [LoadDocument.all.spec.ts](src/test/benchmark/LoadDocument.all.spec.ts).
In this particular test, it will execute the load of dynamically generated containers, defined by
classes that implement the `IDocumentLoaderAndSummarizer` interface.
One of the pre-defined documents is the [DocumentMap.ts](src/test/benchmark/DocumentMap.all.spec.ts) in which
Maps with different number of entries are dynamically added to the document and its loading time collected by the user.

## How to execute the performance E2E tests and visualize the results

In order to run the performance E2E tests, simply choose one of the following commands from the test-end-to-end-tests folder:
`npm run test:benchmark:local` for benchmarks against the local service.
`npm run test:benchmark:odsp` for benchmarks against the ODSP service.
`npm run test:benchmark:frs` for benchmarks against the FRS service.

Notice that every run will generate its output on the console window and, also, json files on the same folder.

## SharedTree compaction summary size

[`historyCompaction.spec.ts`](./historyCompaction.spec.ts) compares full channel-summary blob bytes for equivalent uncompacted and compacted histories.
It uses the selected Fluid service driver, a dedicated summarizer, and a load from the exact uploaded summary version.
It does not measure retained heap memory.
It runs two variants: no customer commit metadata, and a 256-byte ASCII note plus operation, edit-index, and row-ID fields per workload commit.
Both variants use the same single-edit transactions and report decimal MB, captured commits, and customer metadata bytes within history.
All original metadata records must survive compaction and the summary load.
Compaction runs on the interactive client's second channel and, independently, on the summarizer's second channel.
Each client's first channel remains uncompacted as its size-comparison control.
All channels use `retainHistory: true` and share the same container collaboration context.
Local sizes come from full channel summaries generated in memory; summarizer sizes come from the uploaded full summary.
The local compacted blobs are also reloaded with the existing mock channel-storage fixture.
`local.compactionMs` and `summarizer.compactionMs` time the explicit compaction calls, including internal eligibility checks.
They exclude pair selection, test assertions, serialization, upload, reload, and collaboration waits.
This internal prototype uses `NoCompat` and adds no public API or automatic compaction policy.

Build the tree package and its test exports before compiling this package.
From this package's root, run the full workload (10,000 rows, 1,000 replacements, groups of 100):

```bash
pnpm run build:test:esm
FLUID_TEST_PERF_MODE=1 \
MOCHA_SPEC=lib/test/benchmark/historyCompaction.spec.js \
pnpm exec mocha --driver=local --compatKind=None \
--reporter @fluid-tools/benchmark/dist/mocha/Reporter.js
```

Use `--driver=t9s` with a running Tinylicious server, or a configured `--driver=odsp` / `--driver=r11s` endpoint.
Omit `FLUID_TEST_PERF_MODE=1` for the small correctness workload.
Add `--grep 'metadata=none'` or `--grep 'metadata=256-byte-note'` to select just one variant.
See [history-compaction-findings.md](./history-compaction-findings.md) for the compaction methodology, Tinylicious's role, and measured results.
