# Release scripts

These scripts create immutable self-host release bundles under `release-artifacts/<release-id>/`. A release
pins the FluidFramework source revision, records built image metadata, writes deployment files
with digest-pinned images, and validates that those files do not contain floating image
references.

`release-id` defaults to today's UTC date (`YYYY-MM-DD`). Provide an id such as `r0.1.0` for
anything you may need to find or deploy later. Release bundles are immutable; choose a new id rather
than editing files under `release-artifacts/<id>/` by hand.

## Current status

`generate-release.sh` creates a complete release bundle. `create-and-deploy-release.sh` provisions or
reuses a build registry, generates the release bundle, and deploys it with `azure/deploy.sh`.

## Prerequisites

- Bash, `git`, `jq`, `shasum`, and network access to the FluidFramework repository.
- A dedicated FluidFramework clone kept outside this repository, referenced by `FLUID_DIR`. For example
  `git clone https://github.com/microsoft/FluidFramework ~/src/FluidFramework && export FLUID_DIR=~/src/FluidFramework`.
- Docker with `buildx` and network access to the image registries.
- To build and push built images: an authenticated Azure Container Registry login server, for
  example `ACR_LOGIN_SERVER=myacr.azurecr.io` after `az acr login -n myacr`.
- Optional registry provisioning: Azure CLI logged in with permission to create or reuse the target
  resource group and ACR.

## Generate a release bundle

Run from the `tools/selfhost` root:

```bash
TARGET_PLATFORM=linux/amd64 \
ACR_LOGIN_SERVER=myacr.azurecr.io \
FLUID_DIR=~/src/FluidFramework \
./release/generate-release.sh <reviewed-server-or-client-tag> r0.1.0
```

Fluid Framework server and client release tags are published on the
[FluidFramework tags page](https://github.com/microsoft/FluidFramework/tags). Prefer a `server_v*`
release for a self-host deployment: server releases identify a tested set of Routerlicious,
Historian, Gitrest, and related server-package changes. Server releases are published less
frequently than client releases, so a reviewed `client_v*` release is also a valid source when a
more recent monorepo revision is required.

Both tag families are Git references to a specific commit in the FluidFramework monorepo. The
release scripts check out that complete commit and build the server images from the server source
present at that revision; they do not install the published client or server npm packages. Fetch
and list both tag families from the dedicated clone:

```bash
cd "$FLUID_DIR"
git fetch origin --tags
git tag --list 'server_v*' --sort=-version:refname | head -20
git tag --list 'client_v*' --sort=-version:refname | head -20
```

After selecting and reviewing either a server or client tag, pass it directly to
`generate-release.sh`. For example:

```bash
FLUID_TAG=server_vX.Y.Z
git -C "$FLUID_DIR" show --no-patch --format=fuller "$FLUID_TAG"

TARGET_PLATFORM=linux/amd64 \
ACR_LOGIN_SERVER=myacr.azurecr.io \
FLUID_DIR="$FLUID_DIR" \
./release/generate-release.sh "$FLUID_TAG" r0.1.0
```

Review the selected tag and its commit according to your source-review and change-management
process before generating the release. The release tooling resolves either tag family to its
immutable 40-character commit SHA and records that SHA in
`release-artifacts/<release-id>/source.json`. You can pass a reviewed full 40-character commit SHA
directly instead of a tag, including when a required server fix has not yet been included in a
server or client release.

This runs:

1. `pin-source.sh` - resolves a FluidFramework tag or full 40-character SHA and writes
  `release-artifacts/<id>/source.json`.
2. `build-images.sh` - when `ACR_LOGIN_SERVER` is set, builds and pushes `routerlicious`,
  `historian`, and `gitrest`, then writes `release-artifacts/<id>/build.json`.
3. `pin-images.sh` - writes digest-pinned deployment files into `release-artifacts/<id>/deployment/` and
  writes `release-artifacts/<id>/images.json`.
4. `validate-pinned-images.sh` - fails if deployment files contain floating image references.

If `ACR_LOGIN_SERVER` is unset, generated releases can still pin public dependency images, but built
images remain `pending-build` templates. Those releases are not deployable until the built images are
built, pushed, and pinned.

Set `TARGET_PLATFORM` before generating the release. Supported values are `linux/amd64` and
`linux/arm64`; the default is `linux/amd64`.

## Provision a build registry

Use this when you need a build/staging ACR for release image pushes:

```bash
./release/setup-build-registry.sh <acr-name>
```

The ACR name must be 5-50 lowercase alphanumeric characters and globally unique. The script creates
or reuses the registry in `.resourceGroup` from the deploy parameters file, runs `az acr login`, and
prints only the login server on stdout so callers can capture it:

```bash
ACR_LOGIN_SERVER="$(./release/setup-build-registry.sh <acr-name>)"
export ACR_LOGIN_SERVER
```

The script reads `azure/deploy.parameters.json` by default. Set `PARAMETERS_FILE` to use another deploy
parameters file. Optional environment variables: `LOCATION` (default `.location` from the parameters
file), `ACR_SKU` (default `Standard`), and `SUBSCRIPTION`.

## Update dependency images

Use `update-dependency-images.sh` to validate configured dependency image tags or
apply a new tag. The script never selects an update automatically.

To validate the configured dependency image versions:

```bash
./release/update-dependency-images.sh --validate
```

`--validate` uses Docker Buildx to verify that each configured dependency image
supports the current `TARGET_PLATFORM` (default: `linux/amd64`), then reports its
source and image reference.

To update a dependency image version:

```bash
./release/update-dependency-images.sh --name <dependency-name> --image-tag <tag>
```

`update-dependency-images.sh` updates the image versions in `dependency-images.json`.

After updating `dependency-images.json`, [create a new release bundle](#generate-a-release-bundle).

## Update Fluid Framework Dependencies

Follow the [FluidFramework documentation](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Managing-Dependencies.md#upgrading-external-dependencies) for guidance on updating dependencies.

Update the dependencies in the Fluid Framework repository linked in the configuration file "FLUID_DIR"

## Delete a local release bundle

This only removes local files under `release-artifacts/<id>/`; it does not delete registry images or Azure
resources.

```bash
./release/deleteReleaseLocal.sh <release-id>
```

## Create and deploy the release

`create-and-deploy-release.sh` requires a deploy parameters file:

```bash
./release/create-and-deploy-release.sh <tag-or-40-character-sha> [release-id] --parameters <file>
```

Options:

- `--skip-build` - deploy an existing release id instead of generating a new bundle.
- `--skip-deploy` - generate the bundle only.
- `-p, --parameters <file>` - deploy parameters file; the script defaults to
  `azure/deploy.parameters.json`.

The deploy phase calls `azure/deploy.sh`, which deploys the bundle generated under `release-artifacts/`.

## Deploy or roll back an existing release

Use `deploy.sh --deploy-only` to deploy or roll back a complete, previously generated release bundle onto
existing infrastructure:

```bash
./azure/deploy.sh --deploy-only <release-id> [azure/deploy.parameters.json]
```
