# @fluidframework/shared-summary-block

SharedSummaryBlock is a DDS that does not generate ops but is part of the summary. The name block comes from the fact that the data in this object is shared across clients only via summary blocks.
The data on this object must only be set in response to a remote op. Basically, if we replay same ops, the set of calls on this object to set data should be the same. This is critical because it does not generate ops of its own, but relies on the above principle to maintain eventual consistency and to summarize.

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
