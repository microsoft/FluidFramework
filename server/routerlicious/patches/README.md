# Dependency patches

The files in this folder are patches for packages we depend on within the repo. The patches are created using
[pnpm patch](https://pnpm.io/cli/patch), and pnpm applies the patches automatically when running install.

Note: this directory exists separately for `routerlicious` because it runs its CI builds in a docker container that does not have access to other files in the repo.
If this changes, this directory could be deduplicated with `patches` at the repo root.

## Patch details

Each patch is described here, along with any relevant links to issues or PRs and any additional relevant details.

### @microsoft/api-extractor

This patch adds a required fix to make it possible to validate release tag compatibility across package boundaries.
The relevant changes can be found on this branch: https://github.com/Josmithr/rushstack/tree/fix-bundledPackages-incompatible-release-tags
Related github issue: https://github.com/microsoft/rushstack/issues/4430

It also adds the ability to specify `bundledPackages` using regular expressions, rather than exact-match package names.
The relevant changes can be found on this branch: https://github.com/Josmithr/rushstack/tree/regexp-bundledPackages
Related github issue: https://github.com/microsoft/rushstack/issues/4426

Finally, it mitigates an issue where imports (potentially from other packages) are trimmed from the generated type rollups based on the release tags associated with the imported items.
This issue has the potential to create invalid type rollups.
The mitigation is to simply not trim imports in the type rollups - introducing (potentially) unused type imports is benign and should have negligable impact on file sizes in most cases.
The relevant changes can be found on this branch: https://github.com/Josmithr/rushstack/tree/dont-trim-imports
Related github issue: https://github.com/microsoft/rushstack/issues/4425
