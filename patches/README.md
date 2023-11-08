# Dependency patches

The files in this folder are patches for packages we depend on within the repo. The patches are created using
[pnpm patch](https://pnpm.io/cli/patch), and pnpm applies the patches automatically when running install.

## Patch details

Each patch is described here, along with any relevant links to issues or PRs and any additional relevant details.

### engine.io-client

This patch updates the `exports` field in package.json to be correct for TypeScript projects using
`moduleResolution: node16`.

It applies the changes covered in this PR: https://github.com/socketio/engine.io-client/pull/711

As soon as a version of the package is released with the changes in that PR, this patch can be removed.

### socket.io-client

This patch updates the `exports` field in package.json to be correct for TypeScript projects using
`moduleResolution: node16`.

It applies the changes covered in this PR: https://github.com/socketio/socket.io-client/pull/1595

As soon as a version of the package is released with the changes in that PR, this patch can be removed.
