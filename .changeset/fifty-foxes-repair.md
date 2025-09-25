---
"@fluid-experimental/tree-react-api": minor
"@fluidframework/react": minor
"__section": breaking
---
The exports of @fluid-experimental/tree-react-api have been moved to the new @fluidframework/react package and placed under its /alpha exports

`@fluid-experimental/tree-react-api` has been adjusted to align with Fluid Framework's [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).
It has been renamed to `@fluidframework/react` and all existing APIs are now available under `@fluidframework/react/alpha`.

Since this package was under `@fluid-experimental`, previously it implicitly made no guarantees.
Now all the APIs are `@alpha`, which also amounts to making no guarantees but makes it possible to promote APIs to `@beta` in the future to offer some stability.

To accommodate this change, all users of this package will need to adjust:
- Package dependencies from `"@fluid-experimental/tree-react-api"` to `"@fluidframework/react"`.
- Imports from `"@fluid-experimental/tree-react-api"` to `"@fluidframework/react/alpha"`.
