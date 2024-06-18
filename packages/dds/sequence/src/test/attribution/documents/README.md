# Attribution Documents

This directory contains test documents which use different strategies for embedding attribution information.
The operation format is intentionally kept lightweight and shares some code with SharedString fuzz test operations;
it's not intended to cover all concurrency scenarios.

The main purpose for these documents is to assess how well a framework-provided attribution implementation performs
from a snapshot size perspective.

Each subfolder currently contains:

-   `operations.json`: A list of operations that can be used to recreate the document.
    These are the base operations which don't include any potential attribution strategy.
-   A number of other json files which store candidate serialized formats. See the test file for more details.

`sharedString.attribution.spec.ts` does a basic snapshot comparison of the documents in CI in order to keep
the tests functional and document snapshots updated.
Keeping the snapshots in version control also may help reviewers eyeball the impact of various changes and/or
spot inefficiencies in snapshot encoding.
