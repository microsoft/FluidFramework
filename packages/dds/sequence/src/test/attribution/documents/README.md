# Attribution Documents

This directory contains test documents which use different strategies for embedding attribution information.
The operation format is intentionally kept lightweight and shares some code with SharedString fuzz test operations;
it's not intended to cover all concurrency scenarios.

The main purpose for these documents is to assess how well a framework-provided attribution implementation performs
from a snapshot size perspective.

Each subfolder currently contains:

-   `operations.json`: A list of operations that can be used to recreate the document.
    These are the base operations which don't include any potential attribution strategy.
-   `no-attribution-snap.json`: A snapshot of the document after applying all operations as-is.
    This is a reasonable baseline for comparison with storing no attribution information at all
    (effectively, the minimum possible size for the document without changing unrelated aspects of
    the snapshot format)
-   `prop-attribution-snap.json`: A snapshot of the document after applying the equivalent operations, but with
    attribution information embedded in the `props` of text insertions. This is a sample strategy that partner
    teams have used which generally has inefficiency issues.

`sharedString.attribution.spec.ts` does a basic snapshot comparison of the documents in CI in order to keep
the tests functional and document snapshots updated.
Keeping the snapshots in version control also may help reviewers eyeball the impact of various changes and/or
spot inefficiencies in snapshot encoding.
