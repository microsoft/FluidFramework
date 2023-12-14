# Dependency patches

The files in this folder are patches for packages we depend on within the repo. The patches are created using
[pnpm patch](https://pnpm.io/cli/patch), and pnpm applies the patches automatically when running install.

## Patch details

Each patch is described here, along with any relevant links to issues or PRs and any additional relevant details.

### socket.io-client

This patch updates the `exports` field in package.json to be correct for TypeScript projects using
`moduleResolution: node16`.

It applies the changes covered in this PR: https://github.com/socketio/socket.io-client/pull/1595

As soon as a version of the package is released with the changes in that PR, this patch can be removed.

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

### tsc-multi

This patch adds support for rewriting imports in declaration (.d.ts) files by adding an "afterDeclarations" handler to
supplement the existing "after" handler. To enable this feature, add `"rewriteDtsImports": true` to the tsc-multi target
config. If `rewriteDtsImports` is false or omitted, behavior should match exactly what it is today without this feature.

The relevant changes can be found on this branch: <https://github.com/tylerbutler/tsc-multi/tree/dts-imports>
