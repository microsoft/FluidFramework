Welcome to Fluid!

We built Fluid to make it simpler for developers to build real-time collaborative experiences using Web technology.

Fluid's [distributed data structures](./docs/dds.md) make it easy to write apps that are collaborative just like you
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

- Current release version: <a :href="$themeConfig.RELEASE_URL">v{{ $themeConfig.RELEASE_VERSION }}</a>
- Supported former releases: <a :href="$themeConfig.N1_URL">v{{ $themeConfig.N1_VERSION }}</a>

[Learn more about Fluid's release process](./docs/release-process.md)

:::

</vue-markdown>
<vue-markdown v-else-if="$themeConfig.THIS_VERSION === $themeConfig.RELEASE_VERSION">

::: tip Fluid Framework v{{$themeConfig.RELEASE_VERSION}}

- Current release version: <a :href="$themeConfig.RELEASE_URL">v{{ $themeConfig.RELEASE_VERSION }}</a>
- Supported former releases: <a :href="$themeConfig.N1_URL">v{{ $themeConfig.N1_VERSION }}</a>

[Learn more about Fluid's release process](./docs/release-process.md)

:::

</vue-markdown>
<vue-markdown v-else-if="$themeConfig.THIS_VERSION === $themeConfig.N1_VERSION">

::: warning New Fluid release available

This documentation is for an outdated version of the Fluid Framework. A new version of the Fluid Framework is available,
version {{ $themeConfig.RELEASE_VERSION }}. You should consider upgrading as soon as possible.

- Current release version: <a :href="$themeConfig.RELEASE_URL">v{{ $themeConfig.RELEASE_VERSION }}</a>
- Supported former releases: <a :href="$themeConfig.N1_URL">v{{ $themeConfig.N1_VERSION }}</a>

[Learn more about Fluid's release process](./docs/release-process.md)

:::

</vue-markdown>

## New to Fluid?

If you are new to the Fluid Framework, we recommend reading [What is Fluid?](./what-is-fluid.md) to orient yourself.

## Get started now

Get up and running quickly using our [Getting Started guide](./guide/README.md).
