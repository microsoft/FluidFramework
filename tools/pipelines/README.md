# Fluid Framework CI pipelines

Azure Pipelines definitions and shared [`templates/`](./templates) for building, testing, and
releasing the Fluid Framework.

## Mirroring base container images for the server pipelines

The `server-*` pipelines run on a 1ES build pool whose network isolation blocks egress to Docker
Hub, so each server Dockerfile makes its base-image registry overridable via
`ARG BASE_IMAGE_REGISTRY` and CI overrides it to a mirrored copy on a public-accessible ACR
(`fluidpublicmirror-ccbba5fhdscnchft.azurecr.io`; the suffix is ACR's Domain Name Label (DNL)
hash, added to the login-server FQDN to prevent subdomain-takeover attacks — `az acr` CLI
commands still take the bare registry name `fluidpublicmirror`). The same mirror is used by both
the `internal` and `public` ADO projects. Local builds default to Docker Hub and need no changes.

```dockerfile
ARG BASE_IMAGE_REGISTRY=docker.io
FROM ${BASE_IMAGE_REGISTRY}/library/node:22.22.2-bookworm-slim@sha256:f3a68cf4...
```

The pipeline doesn't need to set anything explicitly — `build-docker-service.yml` injects the
build-arg automatically via its `baseImageRegistry` parameter, which defaults to the mirror's
FQDN. Callers can override it if they need a different mirror (e.g. for testing).

The mirror namespace `mirror/docker/library/<image>` is byte-identical to Docker Hub's path, so the
same Dockerfile reference works against either registry. Anonymous pull is disabled on the mirror,
so credentials for the `Fluid Public Mirror Container Registry` ADO service connection are flowed
into the docker build step via `templateContext.authenticatedContainerRegistries` in
[`templates/build-docker-service.yml`](./templates/build-docker-service.yml). Each ADO project has
its own service connection (same name) backed by its own AcrPull-only service principal.

### Upgrading a pinned base image

1. Resolve the new tag's Docker Hub manifest digest:
   ```bash
   docker buildx imagetools inspect docker.io/library/node:<new tag> \
     --format '{{json .Manifest.Digest}}'
   ```

2. Import it into the mirror. The command requires permission to perform
   `Microsoft.ContainerRegistry/registries/importImage/action` on `fluidpublicmirror` (held by the
   `Contributor` role, but **not** by `AcrPull`):
   ```bash
   az acr import --name fluidpublicmirror \
     --source "docker.io/library/node@<new digest>" \
     --image  "mirror/docker/library/node:<new tag>"
   ```
   (ACR's `--source` accepts a tag *or* a digest reference, but not the combined `tag@digest`
   form — pass the digest as the source and let `--image` provide the tag on the destination.)

3. Update the Dockerfile pin(s) in the same PR. The pipeline YAML doesn't change.

After a green run, the previous mirrored tag can be removed with `az acr repository delete` — the
registry has no retention policy, so old tags persist until manually deleted.

### Adding a newly-mirrored base image

Import as above, then in the new Dockerfile declare the build arg and prefix the upstream `FROM`:

```dockerfile
ARG BASE_IMAGE_REGISTRY=docker.io
FROM ${BASE_IMAGE_REGISTRY}/library/<image>:<tag>@<digest>
```

No pipeline YAML changes are needed — `build-docker-service.yml` will pass `BASE_IMAGE_REGISTRY`
through to the build automatically.
