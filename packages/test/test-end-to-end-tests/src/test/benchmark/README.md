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
`npm run test:benchmark:report` for time measurements against the local service.
`npm run test:benchmark:report:odsp` for time measurements against the ODSP service.

`npm run test:memory-profiling:report` for memory measurements against the local service.
`npm run test:memory-profiling:report:ODSP` for memory measurements against the ODSP service.

Notice that every run will generate its output on the console window and, also, json files on the same folder.
