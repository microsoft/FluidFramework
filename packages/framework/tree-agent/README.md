# @fluidframework/tree-agent

This library allows the creation of a "Semantic Agent" - an LLM-backed AI agent that is connected to a SharedTree.
The agent can answer questions about and make edits to the SharedTree.
This gives applications that are backed by a SharedTree an easy interface for adding agentic AI into their experience.

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluidframework/tree-agent
```

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/tree-agent` like normal.

To access the `beta` APIs, import via `@fluidframework/tree-agent/beta`.

To access the `alpha` APIs, import via `@fluidframework/tree-agent/alpha`.

To access the `legacy` APIs, import via `@fluidframework/tree-agent/legacy`.
