# Fuzz Test Cases

This folder contains test files which aren't executed by outermost mocha tests,
but are instead executed as individual test cases as part of `ddsFuzzHarness.spec.ts`.
This enables testing things like:

-   failure behavior of the harness
-   .only related features (which is generally forbidden in CI runs)
-   replay functionality

To debug execution of any of the files in this suite, add `.spec` to the name and use a typical workflow.
