> **Draft:** This document is a work in progress.

## What are API reports and why do we use them?

Some Fluid packages are in various states of readiness and supportability.
As we formally lock down on APIs, we need a way to trigger review of any changes to the public API surface.
That's where [API reports](https://api-extractor.com/pages/overview/demo_api_report/) come in.

API reports are Markdown files comprised mostly of a large block of pseudocode that concisely summarize the API signatures for a given package.
These reports are committed to Git in the `api-report` folder at the root of the repo.

During the local build process, any packages with API reporting enabled will check if there are API changes, then automatically make those changes locally.
You can then include that change in your PR so that the API change can be reviewed.

If an API change is made without the corresponding report change, then the CI build will fail.

## Enabling the API report for a package

1. Change the package's `api-extractor.json` to extend `@fluidframework/build-common/api-extractor-common-report.json`.
2. Run a local build and commit the files generated in the `api-report` folder.
3. Open a PR with the changes.
4. Once merged, you're done!
