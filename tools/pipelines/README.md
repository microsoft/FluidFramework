# Fluid Framework CI pipelines

Azure Pipelines definitions and shared [`templates/`](./templates) for building, testing, and
releasing the Fluid Framework.

## Mirroring base container images for the server pipelines

The `server-*` pipelines run on a 1ES build pool whose network isolation blocks egress to Docker
Hub, so each server Dockerfile makes its base-image registry overridable and the matching pipeline
points it at a mirrored copy on the internal container registry. Local builds default to Docker
Hub and need no changes.

```dockerfile
ARG BASE_IMAGE_REGISTRY=docker.io
FROM ${BASE_IMAGE_REGISTRY}/library/node:22.22.2-bookworm-slim@sha256:f3a68cf4...
```

```yaml
additionalBuildArguments: >-
  --build-arg BASE_IMAGE_REGISTRY=$(containerRegistryUrl)/mirror/docker
```

`$(containerRegistryUrl)` comes from the `container-registry-info` variable group, loaded at the
pipeline root. The mirror namespace `mirror/docker/library/<image>` is byte-identical to Docker
Hub's path, so the same Dockerfile reference works against either registry.

### Upgrading a pinned base image

1. Resolve the new tag's Docker Hub manifest digest:
   ```bash
   docker buildx imagetools inspect docker.io/library/node:<new tag> \
     --format '{{json .Manifest.Digest}}'
   ```

2. Import it into the mirror. The registry name is the value of `containerRegistryUrl` in the
   variable group (drop the `.azurecr.io` suffix); the command requires permission to perform
   `Microsoft.ContainerRegistry/registries/importImage/action` on the registry (held by the
   `Contributor` role, but **not** by `AcrPush`):
   ```bash
   az acr import --name "$ACR_NAME" \
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

In the pipeline YAML, append `--build-arg BASE_IMAGE_REGISTRY=$(containerRegistryUrl)/mirror/docker`
to `additionalBuildArguments`, using YAML's `>-` block scalar to keep multiple args readable.
