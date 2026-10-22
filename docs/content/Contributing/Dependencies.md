# Dependency setup and changes

Fluid Framework uses this public Azure Artifacts feed for npm dependency downloads in local development and PR builds:

```text
https://pkgs.dev.azure.com/fluidframework/public/_packaging/publicPackages/npm/registry/
```

The feed uses npmjs as an upstream source and applies Azure Artifacts supply-chain protections.
Lockfiles use pnpm's default behavior, which omits registry tarball URLs when they can be derived from the configured registry.
This lets you use another registry locally without changing the locked versions or integrity hashes.
Do not commit registry overrides or npmjs tarball URLs when you submit a PR.

## Known limitation: Corepack bootstrap

Azure Artifacts currently does not implement the npm single-version metadata endpoint used by Corepack.
For example, the feed serves `/pnpm` package metadata but returns `404` for `/pnpm/11.27.0`.
With `COREPACK_NPM_REGISTRY` set to `publicPackages`, downloading an uncached pnpm version fails.
Without that override, Corepack normally uses npmjs, which is blocked in some corporate environments.

Until Azure Artifacts supports this endpoint, install pnpm directly.
From the affected workspace, find the version before the integrity suffix in `packageManager`:

```shell
node -p "require('./package.json').packageManager.split('+')[0]"
```

Install that exact package specification globally, replacing `<pnpm-package-spec>` with the output, such as `pnpm@11.27.0`:

```shell
npm install --global <pnpm-package-spec> --registry=https://pkgs.dev.azure.com/fluidframework/public/_packaging/publicPackages/npm/registry/
pnpm --version
```

If npm reports that a Corepack shim already occupies the pnpm command, use `corepack disable pnpm` before the global install.
Do not use `--force` to overwrite an unknown installation.
This changes the active pnpm command for that Node.js installation.
Once installed, pnpm can obtain versions selected by the workspace's `packageManager` field without Corepack.

Codespaces/devcontainers, the Azure Pipelines shared install template, and server Docker builds already install pnpm through npm.
GitHub workflows using the pinned `pnpm/action-setup` action also avoid Corepack.

<details>
<summary>Corepack diagnostics and affected flows</summary>

`corepack enable` only creates command shims; it can succeed even though the first subsequent `pnpm` command fails.
A populated cache can hide the problem until the required pnpm version changes.
The `packageManager` integrity hash does not prevent the metadata request.
Corepack does not read the repository `.npmrc` to select its download registry.
The same endpoint limitation applies to other package managers obtained through Corepack.

Local setup instructions that use Corepack are affected when it targets this feed.
The self-host Azure end-to-end script also uses Corepack for historical checkouts selected with `--compatibility-version`; its ordinary path uses an already installed checkout.
The pinned `pnpm/action-setup` action uses its bundled pnpm installer, not Corepack.

</details>

## Install existing dependencies (no authentication required)

Follow the [repository setup instructions](../../../README.md#setup-and-building), then run this command in the workspace you want to build:

```shell
pnpm install --frozen-lockfile
```

Packages already saved in the public feed can be downloaded anonymously.
This includes external contributors, fork PR builds, and GitHub Actions; they do not need Azure DevOps credentials for these downloads.

If you previously used `scripts/set-dev-registry.cjs` (now deleted), clear its generated overrides with the old script before updating your checkout.
That helper script is no longer needed.
Use `npm config get userconfig` to find your user configuration file.
Inspecting any settings in your user configuration file can help debug registry problems.

## Update or Add dependencies (authentication required)

Adding or updating to a version already saved in the feed does not require authentication.

Artifact feeds require users to have the **Feed and Upstream Reader (Collaborator)** role in order to allow them to save new packages to the feed.
Fluid team members broadly have this role.
Check internal documentation for more information on permissions management if you are a team member and the following instructions do not work.

Follow the instructions on the [publicPackages feed](https://dev.azure.com/fluidframework/public/_artifacts/feed/publicPackages/connect) to authenticate using artifacts-npm-credprovider.

Outdated or missing credentials can manifest as 401 or 404 errors on package installation attempts.

To remove the npm credentials, remove only the `publicPackages` authentication entries from the file reported by `npm config get userconfig`.
If you suspect credential exposure, revoke the affected credential through the identity provider as well; removing a local entry does not revoke it.
Never paste a token, a credential file, or a full authenticated configuration dump into a PR, issue, or build log.

## Change dependencies

Run dependency commands in the affected workspace.
For example, use the root for client packages and `build-tools` for the build tools.
The add, update, and remove commands update the lockfile:

```shell
pnpm add <package>@<version> --filter <workspace-package>
pnpm update <package> --filter <workspace-package>
pnpm remove <package> --filter <workspace-package>
```

For an independent package, omit `--filter`.
For a dependency change made by editing `package.json`, run `pnpm install --no-frozen-lockfile`.
In the root or ESLint configuration workspace, `pnpm install-no-frozen` selects the minimum release age automatically: 7 days for npmjs or 0 for `publicPackages`.
See [minimum release age guidance](../../../DEV.md#updating-dependencies-while-respecting-minimum-release-age) for details.
Review the package manifest and lockfile together.

Before submitting the change, verify the install:

```shell
pnpm install --frozen-lockfile
```

Maintainers saving new versions should verify installation without credentials using an empty pnpm store, including optional packages needed on supported platforms.

## External contributors and dependency bots

Dependency changes from third-party contributors are welcome, even when the contributor cannot save packages in the feed.
You do not need a maintainer's credentials.

1. Describe the dependency change in an issue or draft PR, including the exact package versions and the affected workspace.
2. If a required package is not in the feed, ask a Fluid Framework maintainer in that issue or PR to save it from npmjs.
3. The maintainer authenticates, runs the dependency change against `publicPackages`, and verifies anonymous downloads of the new packages.
4. Update your branch with the resulting manifest and lockfile changes, then run the frozen install again.

You can prototype against npmjs if your environment permits it.
In the root or ESLint configuration workspace, run:

```shell
pnpm install-no-frozen --registry=https://registry.npmjs.org/
```

In other workspaces, use `pnpm --registry=https://registry.npmjs.org/ --config.minimum-release-age=10080 install --no-frozen-lockfile`.
Keep the committed registry settings unchanged.
Never work around a fork PR failure by giving it a maintainer token or by running its code in a privileged workflow.

## Troubleshooting

| Symptom                                                  | Action                                                                                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `401 Unauthorized`                                       | Authenticate again in the same environment and as the same user that runs pnpm. Check whether `NPM_CONFIG_USERCONFIG` selects a different user file.                                                                                 |
| `403 Forbidden` or an upstream-save permission error     | Ask a feed owner to check your Collaborator role and access to the `public` project. A fresh token cannot fix missing permissions.                                                                                                   |
| A package/version is missing, or anonymous install fails | Ask a maintainer to save the exact version and its transitive dependencies. A missing package can appear as `404` rather than an authentication error.                                                                               |
| A package is quarantined                                 | Wait for the feed's protection period or contact a feed owner. Do not change the registry to bypass it.                                                                                                                              |
| Wrong registry                                           | Check `pnpm config get registry` in the affected workspace, including environment and command-line overrides. npm reads `.npmrc`, not `pnpm-workspace.yaml`; pass `--registry` for global npm installs or commands outside the root. |

For feed access or availability issues, contact a Fluid Framework maintainer through the issue or PR.
