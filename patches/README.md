# Dependency patches

The files in this folder are patches for packages we depend on within the repo. The patches are created using
[pnpm patch](https://pnpm.io/cli/patch), and pnpm applies the patches automatically when running install.

## Patch details

Each patch is described here, along with any relevant links to issues or PRs and any additional relevant details.

### @microsoft/api-extractor

We have patched our dependency on `@microsoft/api-extractor` in order to ensure we can validate release tag compatibility across package boundaries.
It is a mitigation of [issue 4430](https://github.com/microsoft/rushstack/issues/4430).

### typebox

We have patched our dependency on `typebox` to declare its modules as side-effect-free, except for the format registry module that initializes the built-in formats when imported.
This enables bundlers to tree-shake unused TypeBox modules while preserving the format registry's initialization.
The patch is a temporary mitigation pending an upstream resolution of [issue 1617](https://github.com/sinclairzx81/typebox/issues/1617).
