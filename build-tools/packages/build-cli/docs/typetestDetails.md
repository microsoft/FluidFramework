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
using the `disabled1 property. See [API Type Validation][] for more information.

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

For more detailed usage information see the
[bump deps command reference](bump.md#flub-bump-deps-packageorreleasegroup).

## Branch configuration

Type tests can be configured to use different baseline versions on a given branch depending on the type of release that
the branch is designated for. For example, for the client release group, the _next_ branch is the _major version series
branch_ and _main_ is the _minor version series branch_. This can be declared in the root package.json, in the
`fluidBuild.repoPackages` section. For example, the following configuration designates the _main_ and _lts_ branches as
minor version series branches, while the _next_ branch is designated for major releases.

```json
"fluidBuild": {
  "repoPackages": {
    "client": {
      "directory": "",
      "ignoredDirs": [],
      "branchReleaseTypes": {
        "main": "minor",
        "lts": "minor",
        "release/*": "patch",
        "next": "major"
      }
    }
  }
}
```

The type test generator takes this information into account when calculating the baseline version to use when it's run
from a particular branch. Baseline versions are set as follows based on the branch release designation:

| Branch release designation | Baseline version | Example: version 2.3.4               |
| -------------------------- | ---------------- | ------------------------------------ |
| patch                      | `previousPatch`  | 2.3.4 baseline version is **2.3.3**  |
| minor                      | `^previousMinor` | 2.3.4 baseline version is **^2.2.0** |
| major                      | `^previousMajor` | 2.3.4 baseline version is **^1.0.0** |
