---
"@fluid-experimental/tree-react-api": minor
"__section": breaking
---
The exports of @fluid-experimental/tree-react-api have been moved under /alpha

`@fluid-experimental/tree-react-api` has been adjusted to align with Fluid Framework's [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

Since this package is under `@fluid-experimental`, previously it implicitly made no guarantees.
Now all the APIs are `@alpha`, which also amounts to making no guarantees but makes it possible to promote APIs to `@beta` in the future to offer some stability.

To accommodate this change, all users of this package will need to adjust their imports from `"@fluid-experimental/tree-react-api"` to `"@fluid-experimental/tree-react-api/alpha"`.
