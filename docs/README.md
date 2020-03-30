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

<vue-markdown v-if="$themeConfig.DOCS_AUDIENCE === 'internal' && $themeConfig.THIS_VERSION === $themeConfig.RELEASE_VERSION">

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

<vue-markdown v-if="$themeConfig.THIS_VERSION === $themeConfig.MASTER_BRANCH_VERSION">

::: danger Bleeding edge documentation

This documentation is for the bleeding edge of the Fluid Framework. **You probably don't want this documentation.**
Instead, you probably want <a :href="$themeConfig.RELEASE_URL">documentation for the current release version</a>,
{{ $themeConfig.RELEASE_VERSION }}, or the <a :href="$themeConfig.N1_URL">previous supported release</a>,
{{ $themeConfig.N1_VERSION }}.

- Current release version: v<a :href="$themeConfig.RELEASE_URL">{{ $themeConfig.RELEASE_VERSION }}</a>
- Supported former releases: v<a :href="$themeConfig.N1_URL">{{ $themeConfig.N1_VERSION }}</a>

[Learn more about Fluid's release process](./contributing/release-process.md)

:::

</vue-markdown>
<vue-markdown v-else-if="$themeConfig.THIS_VERSION === $themeConfig.RELEASE_VERSION">

::: tip Fluid Framework v{{$themeConfig.RELEASE_VERSION}}

- Current release version: v<a :href="$themeConfig.RELEASE_URL">{{ $themeConfig.RELEASE_VERSION }}</a>
- Supported former releases: v<a :href="$themeConfig.N1_URL">{{ $themeConfig.N1_VERSION }}</a>

[Learn more about Fluid's release process](./contributing/release-process.md)

:::

</vue-markdown>
<vue-markdown v-else-if="$themeConfig.THIS_VERSION === $themeConfig.N1_VERSION">

::: warning New Fluid release available

This documentation is for an outdated version of the Fluid Framework. A new version of the Fluid Framework is available,
version {{ $themeConfig.RELEASE_VERSION }}. You should consider upgrading as soon as possible.

- Current release version: v<a :href="$themeConfig.RELEASE_URL">{{ $themeConfig.RELEASE_VERSION }}</a>
- Supported former releases: v<a :href="$themeConfig.N1_URL">{{ $themeConfig.N1_VERSION }}</a>

[Learn more about Fluid's release process](./contributing/release-process.md)

:::

</vue-markdown>

::: danger TypeScript 3.6+ required

Consumers of the Fluid Framework NPM packages **must use a TypeScript version >= 3.6.**

[Read more](./contributing/breaking-changes.md#fluid-packages-require-consumers-on-typescript-3-6)

:::

## New to Fluid?

If you are new to the Fluid Framework, we recommend reading [What is Fluid?](./what-is-fluid.md) to orient yourself.

## Get started now

Get up and running quickly using our [Getting Started guide](./guide/README.md).

<vue-markdown v-if="$themeConfig.DOCS_AUDIENCE === 'internal'">

## Help

### Stack Overflow

The Fluid team answers **questions** on the [Microsoft Stack Overflow](https://stackoverflow.microsoft.com/) using
the [Fluid](https://stackoverflow.microsoft.com/questions/tagged/fluid) tag.

Bugs, suggestions, and issues should be directed to our [issues page](https://github.com/Microsoft/FluidFramework/issues).

Logistical questions can be directed to our [Teams group](https://teams.microsoft.com/l/team/19%3a10ccb94cae324ec2aabcd6b6322b1a25%40thread.skype/conversations?groupId=9ce27575-2f82-4689-abdb-bcff07e8063b&tenantId=72f988bf-86f1-41af-91ab-2d7cd011db47).

### Additional resources

- [Demo videos](./team/videos.md)

</vue-markdown>
