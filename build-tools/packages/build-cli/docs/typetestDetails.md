# Further information about `generate typetests`

The `typetests` and `generate:typetests` commands are used to generate and manage type compatibility tests based on the
individual package settings in package.json.

## What are type compatibility tests?

Type compatibility tests, often referred to as "type tests," are automatically generated test cases that check for type
incompatibilities across package versions. They work by comparing types in the current version to the types in a
previous version. The generated tests use the previous type in place of the new type, and vice-versa.

See the [API Type Validation][] page in the Fluid Framework wiki for more information about type compatibility tests,
including how to annotate expected type incompatibilities to fix failing tests.

## Configuring type tests

Type test generation is primarily configured in the package.json file of the package being tested, in the
`typeValidation` section:

```json
"typeValidation": {
  "disabled": false,
  "broken": {
    "InterfaceDeclaration_AzureClientProps": {
      "forwardCompat": false
    }
  },
  "entrypoint": "legacy"
}
```

The `broken` section is used to indicate known breaking changes. See [API Type Validation][] for more information about
disabling failing tests. The contents of this section can be removed using the `--reset` flag in `flub typetests`.

Type tests can be completely disabled for a package using the `disabled` property. This value can also be set using the
`--disable` flag in `flub typetests`.

Generating type tests has two parts: the prepare phase and the generate phase. The prepare phase is done using
`flub typetests`, while `flub generate:typetests` handles the generate phase.

See the [`flub typetests`](./typetests.md) and [`flub generate:typetests`](./generate.md#flub-generate-typetests)
reference documentation for details about the flags and options they provide.

## The prepare phase: resetting tests and updating the previous version

The prepare phase determines the baseline previous version to use, updates the previous version dependency, resets any typetest overrides (the entries in `typeValidation.broken`), and normalizes `typeValidation` settings.

The prepare phase is typically used when resetting the type tests to a clean state, such as after a release.

### Running typetests:prepare

While you can run `flub typetests` directly, the prepare phase is typically done by running `pnpm typetests:prepare`,
which invokes `flub typetests` with the following flags: `--reset --previous --normalize`

> [!TIP]
> The `broken` and `entrypoint` properties in package.json are always present, even when typetests are disabled
> (`"disabled"=true`). If removed, they will be added back during the prepare phase.

If the version changes after running preparation, then `pnpm install --no-frozen-lockfile` must be run
before the generate phase will run correctly.

### Baseline versions in pnpm catalogs

In pnpm workspaces, `flub typetests --previous` and `flub typetests --exact <version>` store baseline aliases in the `typeTest-previous` catalog in the workspace's `pnpm-workspace.yaml`:

```yaml
catalogs:
  typeTest-previous:
    "@fluidframework/example-previous": npm:@fluidframework/example@3.5.0
```

The command creates the catalog if needed and sets each selected package's devDependency to `catalog:typeTest-previous`.
Later baseline updates change the catalog entries without changing these dependency declarations.
Only selected packages are updated; other catalog entries and workspace settings are preserved.

Use `--no-catalog` with `--previous` or `--exact` to write inline npm aliases in package.json instead.
Packages outside pnpm workspaces always use inline aliases.
Without `--previous` or `--exact`, the command does not migrate existing dependencies to a catalog.

Removing a dependency with `--remove` or disabling type tests removes the package.json dependency but keeps the catalog entry.
Other packages can still reference that entry.
You can remove unused catalog entries manually.

## The generate phase

### Inputs to the generation process

The generation process has three inputs:

1. The previous version of the package, which is a devDependency of the package being tested.
2. The `typeValidation` settings in package.json, most notably the `broken` and `entrypoint` settings.
3. The `--entrypoint` flag in `flub generate:typetests`. If provided, this overrides the `typeValidation.entrypoint`
   setting in package.json.

The generation process reads the configuration from package.json, most notably any known broken type tests, and
generates test files that should be committed. Notably, the type tests only read the previous version of the package,
and use it to generate the tests. When types are removed, the tests can be disabled using the "broken" entries as usual.

### Running typetests:gen

While you can run `flub generate:typetests` directly, the generate phase is typically done by running `pnpm typetests:gen`,
which invokes each package's `typetests:gen` script.

See the [`flub generate:typetests`](./generate.md#flub-generate-typetests) reference documentation for
details about the flags and options available.

> [!NOTE]
> The `generate:typetests` command is designed to produce a single output file - the type tests - per invocation, and to
> generate tests for a single entrypoint. If you want to generate tests for both the alpha entrypoint and the legacy
> entrypoint, for example, you will need to use `generate:typetests` twice, once for each entrypoint.

<!-- Links -->
[api type validation]: ../../../../docs/content/Contributing/API-Type-Validation.md
