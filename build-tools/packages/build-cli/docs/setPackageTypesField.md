`flub setPackageTypesField`
===========================

Updates which .d.ts file is referenced by the `types` field in package.json. This command is used during package publishing (by CI) to select the d.ts file which corresponds to the selected API-Extractor release tag.

* [`flub setPackageTypesField`](#flub-setpackagetypesfield)

## `flub setPackageTypesField`

Updates which .d.ts file is referenced by the `types` field in package.json. This command is used during package publishing (by CI) to select the d.ts file which corresponds to the selected API-Extractor release tag.

```
USAGE
  $ flub setPackageTypesField --types <value> [-v | --quiet] [--concurrency <value>] [--all | --dir <value> | --packages |
    -g client|server|azure|build-tools|gitrest|historian|all | --releaseGroupRoot
    client|server|azure|build-tools|gitrest|historian|all] [--private] [--scope <value> | --skipScope <value>] [--json]

FLAGS
  --concurrency=<value>  [default: 25] The number of tasks to execute concurrently.
  --types=<value>        (required) Which .d.ts types to include in the published package.

PACKAGE SELECTION FLAGS
  -g, --releaseGroup=<option>...  Run on all child packages within the specified release groups. This does not include
                                  release group root packages. To include those, use the --releaseGroupRoot argument.
                                  Cannot be used with --all, --dir, or --packages.
                                  <options: client|server|azure|build-tools|gitrest|historian|all>
  --all                           Run on all packages and release groups. Cannot be used with --all, --dir,
                                  --releaseGroup, or --releaseGroupRoot.
  --dir=<value>                   Run on the package in this directory. Cannot be used with --all, --dir,
                                  --releaseGroup, or --releaseGroupRoot.
  --packages                      Run on all independent packages in the repo. Cannot be used with --all, --dir,
                                  --releaseGroup, or --releaseGroupRoot.
  --releaseGroupRoot=<option>...  Run on the root package of the specified release groups. This does not include any
                                  child packages within the release group. To include those, use the --releaseGroup
                                  argument. Cannot be used with --all, --dir, or --packages.
                                  <options: client|server|azure|build-tools|gitrest|historian|all>

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
  --quiet        Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

PACKAGE FILTER FLAGS
  --[no-]private          Only include private packages. Use --no-private to exclude private packages instead.
  --scope=<value>...      Package scopes to filter to. If provided, only packages whose scope matches the flag will be
                          included. Cannot be used with --skipScope.
  --skipScope=<value>...  Package scopes to filter out. If provided, packages whose scope matches the flag will be
                          excluded. Cannot be used with --scope.

DESCRIPTION
  Updates which .d.ts file is referenced by the `types` field in package.json. This command is used during package
  publishing (by CI) to select the d.ts file which corresponds to the selected API-Extractor release tag.
```

_See code: [src/commands/setPackageTypesField.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/setPackageTypesField.ts)_
