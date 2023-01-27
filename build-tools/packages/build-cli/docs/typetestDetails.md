# Further information about `generate typetests`

The `generate typetests` command generates type compatibility tests based on the individual package settings in
package.json.

## What are type compatibility tests?

Type compatibility tests are automatically generated test cases that check for type incompatibilities across package
versions. They work by comparing types in the current version to the types in a previous version. The generated tests
use the previous type in place of the new type, and vice-versa.

See the [API Type Validation][] page in the Fluid Framework wiki for more information about type compatibility tests,
including how to annotate expected type incompatibilities to fix failing tests.

## Configuring type tests

Type test generation is primarily configured in the package.json file of the package being tested, in the
`typeValidation` section:

```json
"typeValidation": {
  "disabled": false,
  "version": "1.1.0",
  "broken": {
    "InterfaceDeclaration_AzureClientProps": {
      "forwardCompat": false
    }
  }
}
```

The `broken` section is used to indicate known breaking changes. Type tests can be completely disabled for a package
using the `disabled` property. See [API Type Validation][] for more information.

Generating type tests has two parts: _preparing package.json_ and _generating test modules_. By default, both steps are
run for each package. You can run only one part at a time using the `--prepare` and `--generate` flags.

[api type validation]: https://github.com/microsoft/FluidFramework/wiki/API-Type-Validation

## Preparing package.json

_Preparing package.json_ determines the baseline previous version to use, then sets that version in package.json. If the
previous version changes after running preparation, then `npm install` must be run before the generate step will run
correctly.

Optionally, any type tests that are marked "broken" in package.json can be reset using the `--reset` flag during
preparation. This is useful when resetting the type tests to a clean state, such as after a major release.

## Generating tests

Generating test modules takes the type test information from package.json, most notably any known broken type tests, and
generates test files that should be committed. By default, the generated files will contain `.generated` in their name,
but this can be suppressed with the `--no-generateInName` flag.

## Branch configuration

Type tests can be configured to use different baseline versions on a given branch depending on the type of release that
the branch is designated for. For example, for the client release group, the _next_ branch is the _major version series
branch_ and _main_ is the _minor version series branch_. This can be declared in the root package.json for the release
group, in the `fluidBuild.branchReleaseTypes` section. For example, the following configuration designates the _main_ and
_lts_ branches as minor version series branches, while the _next_ branch is designated for major releases.

```json
"fluidBuild": {
  "branchReleaseTypes": {
    "main": "minor",
    "lts": "minor",
    "release/**": "patch",
    "next": "major"
  }
}
```

The branch names can be globs. They are matched using [minimatch](https://www.npmjs.com/package/minimatch).

The type test generator takes this information into account when calculating the baseline version to use when it's run
on a particular branch. Baseline versions are set as follows based on the branch release designation:

| Branch release designation | Baseline version | Example: version 2.3.4 |
| -------------------------- | ---------------- | ---------------------- |
| `patch`                    | `previousPatch`  | **2.3.3**              |
| `minor`                    | `~previousMinor` | **~2.2.0**             |
| `major`                    | `^previousMajor` | **^1.0.0**             |

### Configuring a branch for a specific baseline

It may be useful to configure a branch for a specific baseline instead of the default based on the branch release
designation. To do this, you can use any of the following strings instead of major/minor/patch.

-   `baseMajor`
-   `baseMinor`
-   `~baseMinor`
-   `previousPatch`
-   `previousMinor`
-   `previousMajor`
-   `^previousMajor`
-   `^previousMinor`
-   `~previousMajor`
-   `~previousMinor`

The "base" versions are calculated by zeroing out all version segments lower than the base. That is, for a version _v_,
the baseMajor version is `${v.major}.0.0` and the baseMinor version is `${v.major}.${v.minor}.0`.

The "previous" versions work similarly, but the major/minor/patch segment is reduced by 1. That is, for a version _v_,
the previousMajor version is `${min(v.major - 1, 1)}.0.0`, the previousMinor version is
`${v.major}.${min(v.minor - 1, 0)}.0`, and the previousPatch is `${v.major}.${v.minor}.${min(v.patch - 1, 0)}`.

The "previous" versions never roll back below 1 for the major version and 0 for minor and patch. That is, the
previousMajor, previousMinor, and previousPatch versions for `1.0.0` are all `1.0.0`.

**Warning**: `^previousMinor` allows the baseline (the "previous" version) to jump into the same range as the current version, so use with caution.
In most cases, you probably want to use `~previousMinor`.

#### Examples

Given the version 3.4.5:

| Previous version style | Baseline version for **3.4.5** |
| ---------------------- | ------------------------------ |
| `baseMajor`            | 3.0.0                          |
| `baseMinor`            | 3.4.0                          |
| `~baseMinor`           | ~3.4.0                         |
| `previousPatch`        | 3.4.4                          |
| `previousMajor`        | 2.0.0                          |
| `previousMinor`        | 3.3.0                          |
| `^previousMajor`       | ^2.0.0                         |
| `^previousMinor`       | ^3.3.0                         |
| `~previousMajor`       | ~2.0.0                         |
| `~previousMinor`       | ~3.3.0                         |

Given the version 2.0.0-internal.2.3.5:

| Previous version style | Baseline version for **2.0.0-internal.2.3.5** |
| ---------------------- | --------------------------------------------- |
| `baseMajor`            | 2.0.0-internal.2.0.0                          |
| `baseMinor`            | 2.0.0-internal.2.3.0                          |
| `~baseMinor`           | >=2.0.0-internal.2.3.0 <2.0.0-internal.3.0.0  |
| `previousPatch`        | 2.0.0-internal.2.3.4                          |
| `previousMajor`        | 2.0.0-internal.1.0.0                          |
| `previousMinor`        | 2.0.0-internal.2.2.0                          |
| `^previousMajor`       | >=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0  |
| `^previousMinor`       | >=2.0.0-internal.2.2.0 <2.0.0-internal.3.0.0  |
| `~previousMajor`       | >=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0  |
| `~previousMinor`       | >=2.0.0-internal.2.2.0 <2.0.0-internal.2.3.0  |

Given the version 2.0.0-internal.2.0.0:

| Previous version style | Baseline version for **2.0.0-internal.2.0.0** |
| ---------------------- | --------------------------------------------- |
| `baseMajor`            | 2.0.0-internal.2.0.0                          |
| `baseMinor`            | 2.0.0-internal.2.0.0                          |
| `~baseMinor`           | >=2.0.0-internal.2.0.0 <2.0.0-internal.2.1.0  |
| `previousPatch`        | 2.0.0-internal.2.0.0                          |
| `previousMajor`        | 2.0.0-internal.1.0.0                          |
| `previousMinor`        | 2.0.0-internal.2.0.0                          |
| `^previousMajor`       | >=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0  |
| `^previousMinor`       | >=2.0.0-internal.2.0.0 <2.0.0-internal.3.0.0  |
| `~previousMajor`       | >=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0  |
| `~previousMinor`       | >=2.0.0-internal.2.0.0 <2.0.0-internal.2.1.0  |

## Pinning to a specific version

This is useful when you want to regularly update the baseline version when releases happen, but only when explicitly
updated, such as part of a release process. You can do this with a combination of a baseline range such as
`^previousMajor` and the `--pin` flag.

The `--pin` flag searches the release git tags in the repo and selects the baseline version as the maximum released
version that matches the range. This effectively pins the version to a specific version while allowing it to be updated
manually as needed by running type test preparation again.

This is functionally similar to what a lockfile does, but this provides us with an extra level of control so we don't
rely on lockfiles for type test package versions, because we have found bugs in lockfile handling related to npm
aliases, which the type test infrastructure relies on.
