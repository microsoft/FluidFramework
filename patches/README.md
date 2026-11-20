# Dependency patches

The files in this folder are patches for packages we depend on within the repo. The patches are created using
[pnpm patch](https://pnpm.io/cli/patch), and pnpm applies the patches automatically when running install.

## Patch details

Each patch is described here, along with any relevant links to issues or PRs and any additional relevant details.

### @microsoft/api-extractor

We have patched our dependency on `@microsoft/api-extractor` in order to ensure we can validate release tag compatibility across package boundaries.
It is a mitigation of [issue 4430](https://github.com/microsoft/rushstack/issues/4430).

The root patch also omits import declarations from API reports.
The separate patch in `server/routerlicious/patches` only applies the release tag compatibility fix.
When updating API-Extractor, rebase both patches and update their registrations in the root, `common-utils`, `protocol-definitions`, and `server/routerlicious` pnpm workspaces.
