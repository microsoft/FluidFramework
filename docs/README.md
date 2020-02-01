---
home: true
# heroImage: /images/homescreen144.png
heroText: "Fluid Framework"
showHeroSymbol: true
# tagline: State that flows
# actionText: Get Started →
# actionLink: /guide/
# features:
# - title: Current version
#   details: "0.14"
# - title: Vue-Powered
#   details: Enjoy the dev experience of Vue + webpack, use Vue components in markdown, and develop custom themes with Vue.
# - title: Performant
#   details: VuePress generates pre-rendered static HTML for each page, and runs as an SPA once a page is loaded.
footer: Made with ❤ in Redmond.
---

<vue-markdown v-if="$themeConfig.fluidVarGroup === 'internal'">

::: tip

The URL to this documentation is <https://aka.ms/fluid>

:::

</vue-markdown>


Welcome to Fluid!

We built Fluid to make it simpler for developers to build real-time collaborative experiences using Web technology.

Fluid's [distributed data structures](./guide/dds.md) make it easy to write apps that are collaborative just like you
would build single-user applications and experiences. Fluid handles keeping your data in sync across multiple clients,
so you can focus on your app's business logic. Fluid's data synchronization is fast, efficient, and requires very little
bandwidth. Fluid is extensible, too. You can write components which can be re-used or you can even create new
distributed data structures.

::: important Supported versions

- Current release version: `0.15.x`
- Supported releases: `>=0.14.x, <=0.15.x`

[Learn more about Fluid's release process](./contributing/release-process.md)

:::


::: danger TypeScript 3.6+ required

Consumers of the Fluid Framework NPM packages **must use a TypeScript version >= 3.6.**

[Read more](./contributing/breaking-changes.md#fluid-packages-require-consumers-on-typescript-3-6)

:::

## New to Fluid?

If you are new to the Fluid Framework, we recommend reading [What is Fluid?](./what-is-fluid.md) to orient yourself.

## Get started now

Get up and running quickly using our [Getting Started guide](./guide/README.md).

