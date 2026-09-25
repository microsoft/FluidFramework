# Dependency patches

The files in this folder are patches for packages we depend on within the repo. The patches are created using
[pnpm patch](https://pnpm.io/cli/patch), and pnpm applies the patches automatically when running install.

## Patch details

Each patch is described here, along with any relevant links to issues or PRs and any additional relevant details.

### @microsoft/api-extractor

We have patched our dependency on `@microsoft/api-extractor` in order to ensure we can validate release tag compatibility across package boundaries.
It is a mitigation of [issue 4430](https://github.com/microsoft/rushstack/issues/4430).

### @quill-next/delta-es

We patch `@quill-next/delta-es` (a dependency of `quill-next`) to make its types work with `node16` module resolution.
The package does not set `"type": "module"`, so TypeScript reads its `.d.ts` files as CommonJS.
This gives the incorrect type for the default import.
The patch adds `"type": "module"` to `dist/types` and adds `.js` extensions to the relative imports.
