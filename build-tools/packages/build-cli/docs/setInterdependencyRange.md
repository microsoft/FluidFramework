`flub setInterdependencyRange`
==============================

Modifies the interdependency range used within a release group.

* [`flub setInterdependencyRange GROUP INTERDEPENDENCYRANGE`](#flub-setinterdependencyrange-group-interdependencyrange)

## `flub setInterdependencyRange GROUP INTERDEPENDENCYRANGE`

Modifies the interdependency range used within a release group.

```
USAGE
  $ flub setInterdependencyRange GROUP INTERDEPENDENCYRANGE [-v | --quiet]

ARGUMENTS
  GROUP                 The release group to modify.
  INTERDEPENDENCYRANGE  (^|~||workspace:*|workspace:^|workspace:~) Controls the type of dependency that is used between
                        packages within the release group. Use "" (the empty string) to indicate exact dependencies.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Modifies the interdependency range used within a release group.

  Used by the release process to set the interdependency range in published packages.
```

_See code: [src/commands/setInterdependencyRange.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/setInterdependencyRange.ts)_
