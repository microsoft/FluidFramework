# @fluid-private/test-version-utils

This is a package for writing and setting up Fluid end to end tests using `mocha` that will generate variants with
a specific driver and different version combinations of Fluid API between layers via `TestObjectProvider` provided
to the test. The different layers are loader, driver, container runtime and data runtime (includes DDS). Version
combinations and driver selection can be controlled via the `mocha` command line, assuming your test uses the provided
`describe*` functions. For advanced usage, a test can bypass this mechanism and directly call our
exports to get the versioned Fluid APIs.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**NOTE: This package is private to the `@microsoft/fluid-framework` repository.**
**It is not published, and therefore may only be used in packages within the same pnpm workspace in this repo using the [workspace:*](https://pnpm.io/workspaces#workspace-protocol-workspace) schema.**
**Since this package is not published, it may also only be used as a dev dependency, or as a dependency in packages that are not published.**

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Versioned combination test generation

### Layer version combinations

Similar to `mocha`'s `describe`, this package provide a `describeCompat` function that will generate variants with
a specific driver and different version combinations of Fluid API between layers. All possible layer combinations that
are generated (empty entries are current versions):

| Compat Kind         | Loader | Driver | Container Runtime | Data Runtime |
| ------------------- | ------ | ------ | ----------------- | ------------ |
| None                |        |        |                   |              |
| Loader              | old    |        |                   |              |
| Driver              |        | old    |                   |              |
| ContainerRuntime    |        |        | old               |              |
| DataRuntime         |        |        |                   | old          |
| NewLoader           |        | old    | old               | old          |
| NewDriver           | old    |        | old               | old          |
| NewContainerRuntime | old    | old    |                   | old          |
| NewDataRuntime      | old    | old    | old               |              |

### Cross version combinations

In addition to the layer version combinations seen above, this package also provides functions to generate variations
intended to test all layers of one version against all layers of another version in tests that feature more than one client.
The intention is to simulate scenarios where the client that created a document was using a different version than the client
loading the document. These variations are applied in our cross version tests where we test the current version against the
most recent **public** release.

For example, at the time of writing, main is on version `2.0.0-internal.7.3.0` and the latest **public** release is `1.3.7`.
Therefore, we would test the following combinations:

-   Client A is running `2.0.0-internal.7.3.0` across **all** layers and Client B is running `1.3.7` across **all** layers.
-   Client A is running `1.3.7` across **all** layers and Client B is running `2.0.0-internal.7.3.0` across **all** layers.

### Mocha test setup with layer version combinations

`describeCompat` expects 3 arguments (name: string, compatVersionKind: CompatVersionKind, tests). There are three compatVersionKind options to generate different combinations, depending of the need of the tests:

`FullCompat`: generate test variants with compat combinations that varies the version for all layers.

-   Used for tests that exercise all layers and will benefits compat combinations of all layers.

`LoaderCompat`: generate test variants with compat combinations that only varies the loader version.

-   Use for tests that targets the loader layer, and don't care about compat combinations of other layers.
-   Test combination generated: [CompatKind.None, CompatKind.Loader]

This compat `describe*` function will also load the APIs with appropriate version and provide the test with a
`TestObjectProvider` object, where the test can use to access Fluid functionality. Even when compat testing
is not necessary, `TestObjectProvider` provide functionalities that help writing Fluid tests, and it allows the test
to enable compat testing easily in the future just by changing the compatVersionKind parameter.

### Legacy version defaults and installation

By default, N-1 (public release), N-1 (internal release), N-2 (internal release), and LTS (hard coded) test variants are
generated. The versions can be specified using command line (see below) to run the test against any two versions. This
package includes a `mocha` global hook that will install legacy packages at the beginning of the package based on the
`compatVersion` settings.

## Command line options

Tests using `describeCompat` will be controllable using the command line options when running mocha on
driver selection, versions for compat testing, and compat kind combinations.

```text
--compatKind <CompatKind> - filter to the compat variant. See above table. Can be specified multiple times.
                                Default: undefined (no filter)
--compatVersion <version> - specify the old version. Relative (to base) or specific version. Can be specified multiple times.
                                Default: -1, -2, LTS (hard coded in src/compatConfig.ts)
--baseVersion <version>   - specify the base (new) version. Allow the test to run against any version combinations.
                                Default: <current> (same version of the test package)
--driver <driverType>     - <driverType> = "tinylicious" | "t9s" | "routerlicious" | "r11s" | "odsp" | "local"
                                Default: "local"
--r11sEndpointName <name> - Determine the environment variable name to look for r11s service information to target.
                                Default: "r11s"
--tenantIndex <number>    - Index into the tenant list, modulo the number of tenant available, for odsp server info to target.
                                Default: 0
--reinstall               - Force reinstall any required versions.  Default: reuse if a version is already installed.
```

`baseVersion` is a semver or a semver range.

-   If it is a semver range, the latest in that range will be picked.

`compatVersion` can be a semver or semver range or an integer apply to the minor version relative to `baseVersion`

-   If it is a semver range, the latest in that range will be picked.
-   If it is an integer, the value will be apply to the minor version of the `baseVersion`, and create a `^` range
    including prerelease versions. The latest in that range will be picked.
    -   i.e. if `baseVersion` is `0.2.3`, and `compatVersion` is `-1`, the resulting range
        will be `^0.1.3-0`

We also accept some of the flags via environment variables.

| Environment Variables         | Command line options |
| ----------------------------- | -------------------- |
| fluid**test**compatKind       | --compatKind         |
| fluid**test**compatVersion    | --compatVersion      |
| fluid**test**driver           | --driver             |
| fluid**test**r11sEndpointName | --r11sEndpointName   |
| fluid**test**baseVersion      | --baseVersion        |

## Advanced usage

This bypasses any configuration of version used by the describe\* functions and provides direct access to the versioned APIs.

First make sure to call `ensurePackageInstalled` before running the tests to make sure the necessary legacy version are
installed.

The main entry point is `getVersionedTestObjectProvider` to get a `TestObjectProvider` for a specific version combinations
and driver config. Additionally, you can get versioned API for specific layers using these API.

-   `getLoaderApi`
-   `getDriverApi`
-   `getContainerRuntimeApi`
-   `getDataRuntimeApi`

All these API returns the current version by default if no arguments is passed.
If a number is provided, a relative version will be computed by adding the number to the minor version number
of the current version, and find the latest patch version. (`^0.<current+requested>.0`).
If a string is provided, then the string is treated as a specific version or a range of version, and it will
resolve the latest version that matches it.

OPEN ISSUE: while these API can be used directly, currently the default global mocha hook will still run and install the
default set of legacy versions whether it is necessary or not.

## Implementation notes

The legacy version are installed in their own version folder
`./../node_modules/.legacy/<version>` (current package root's node_module directory).

Legacy versions of all packages in all categories are installed regardless of what compat combination is requested.
(See `packageList` in `src/testApi.ts`).

For now, the current versions are statically bound to also provide typings.
This is a lie since the public API of a package may change over time: `ContainerRuntime` in FF@10.0.0 will not have the
same public API as `ContainerRuntime` in FF@1.0.0.

For the most part, public API breaks are relatively contained and the type is "correct enough" that increasing the
complexity of the typing setup isn't worth the associated redesign.
However, this does give rise to several places in this package and test-utils that have intentional "back-compat" code.
See for example [`versionHasMovedSparsedMatrix`](https://github.com/microsoft/FluidFramework/blob/e5b339c9e0cd6b96410ff2bc02206c66c636ccd9/packages/test/test-version-utils/src/versionUtils.ts#L467) or [explicitly using ContainerRuntime.load over the newer variant](https://github.com/microsoft/FluidFramework/blob/e5b339c9e0cd6b96410ff2bc02206c66c636ccd9/packages/test/test-utils/src/testContainerRuntimeFactory.ts#L67).

Thus it's important to keep in mind that the type provided by static import or `import type` might not align exactly with the
runtime object once taking the compatibility configuration into account.

### ChannelFactoryRegistry Rewriting

This package currently has [some logic](https://github.com/microsoft/FluidFramework/blob/e5b339c9e0cd6b96410ff2bc02206c66c636ccd9/packages/test/test-version-utils/src/compatUtils.ts#L67) to rewrite the ChannelFactoryRegistry used to create a TestObjectProvider.

This means that statically importing and referencing a DDS in a test file _will_ correctly result in referencing the version of that DDS defined in the compatibility configuration,
but this happens implicitly.
Test authors are encouraged to use the `apis` argument of `describeCompat`'s test creation callback to reference the DDS instead.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
