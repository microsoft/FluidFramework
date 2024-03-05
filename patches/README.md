# Dependency patches

The files in this folder are patches for packages we depend on within the repo. The patches are created using
[pnpm patch](https://pnpm.io/cli/patch), and pnpm applies the patches automatically when running install.

## Patch details

Each patch is described here, along with any relevant links to issues or PRs and any additional relevant details.

### tsc-multi

This patch adds support for rewriting imports in declaration (.d.ts) files by adding an "afterDeclarations" handler to
supplement the existing "after" handler. To enable this feature, add `"dtsExtName": ".d.mts"` to the tsc-multi target
config. The value should be the desired file extension for declaration files. If `dtsExtName` is omitted, behavior
should match exactly what it is today without this feature.

The relevant changes can be found on this branch: <https://github.com/tylerbutler/tsc-multi/tree/dts-imports>
