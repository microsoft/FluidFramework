# @fluidframework/test-version-utils

This is a package for writing and setting up Fluid end to end tests using `mocha` that will generate variants with
a specific driver and different version combinations of Fluid API between layers via `TestObjectProvider` provided
to the test. The different layers are loader, driver, container runtime and data runtime (includes DDS).  Version
combinations and driver selection can be controlled via the `mocha` command line, assuming your test uses the provided
 `describe*` functions.  For advanced usage, a test can bypass this mechanism and directly call our
exports to get the versioned Fluid APIs.

## Versioned combination test generation

### Layer version combinations

Similar to `mocha`'s `describe`, this package provide various `describe*` functions that will generate variants with
a specific driver and different version combinations of Fluid API between layers. All possible layer combinations that
are generated (empty entries are current versions):

| Compat Kind         | Loader | Driver | Container Runtime | Data Runtime |
| ------------------- | ------ | ------ | ----------------- | ------------ |
| None                |        |        |                   |              |
| Loader              |  old   |        |                   |              |
| Driver              |        |  old   |                   |              |
| ContainerRuntime    |        |        | old               |              |
| DataRuntime         |        |        |                   | old          |
| NewLoader           |        |  old   | old               | old          |
| NewDriver           |  old   |        | old               | old          |
| NewContainerRuntime |  old   |  old   |                   | old          |
| NewDataRuntime      |  old   |  old   | old               |              |

### Mocha test setup with layer version combinations

There are three compat `describe*` to generate different combinations, depending of the need of the tests

`describeFullCompat`: generate test variants with compat combinations that varies the version for all layers.

- Used for tests that exercise all layers and will benefits compat combinations of all layers.

`describeLoaderCompat`: generate test variants with compat combinations that only varies the loader version.

- Use for tests that targets the loader layer, and don't care about compat combinations of other layers.
- Test combination generated: [CompatKind.None, CompatKind.Loader]

`describeNoCompat` - generate one test variant that doesn't varies version of any layers.

- Use for tests that doesn't benefit or require any compat testing.
- Test combination generated: [CompatKind.None]

These compat `describe*` functions will also load the APIs with appropriate version and provide the test with a
`TestObjectProvider` object, where the test can use to access Fluid functionality.  Even when compat testing
is not necessary, `TestObjectProvider` provide functionalities that help writing Fluid tests, and it allows the test
to enable compat testing easily in the future just by changing the `describe*`.

### Legacy version defaults and installation

By default, N-1, N-2, and LTS (hard coded) test variants are generated.  The versions can be specified using command
line (see below) to run the test against any two versions. This package includes a `mocha` global hook that will
install legacy packages at the beginning of the package based on the `compatVersion` settings.

## Command line options

Tests using the compat `describe*` will be controllable using the command line options when running mocha on
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

- If it is a semver range, the latest in that range will be picked.

`compatVersion` can be a semver or semver range or an integer apply to the minor version relative to `baseVersion`

- If it is a semver range, the latest in that range will be picked.
- If it is an integer, the value will be apply to the minor version of the `baseVersion`, and create a `^` range
including prerelease versions. The latest in that range will be picked.
  - i.e. if `baseVersion` is `0.2.3`, and `compatVersion` is `-1`, the resulting range
will be `^0.1.3-0`

We also accept some of the flags via environment variables.

| Environment Variables         | Command line options |
| ----------------------------- | -------------------- |
| fluid__test__compatKind       | --compatKind         |
| fluid__test__compatVersion    | --compatVersion      |
| fluid__test__driver           | --driver             |
| fluid__test__r11sEndpointName | --r11sEndpointName   |
| fluid__test__baseVersion      | --baseVersion        |

## Advanced usage

This bypasses any configuration of version used by the describe* functions and provides direct access to the versioned APIs.

First make sure to call `ensurePackageInstalled` before running the tests to make sure the necessary legacy version are
installed.

The main entry point is `getVersionedTestObjectProvider` to get a `TestObjectProvider` for a specific version combinations
and driver config.  Additionally, you can get versioned API for specific layers using these API.

- `getLoaderApi`
- `getDriverApi`
- `getContainerRuntimeApi`
- `getDataRuntimeApi`

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

For now, the current version are statically bound to also provide type.  Although it can be switch to
dynamic loading for consistency (or don't want to force the script to be loaded if they are not needed).
Currently, we don't have such scenario yet.
