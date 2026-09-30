# Fluid Framework CI pipelines

Azure Pipelines definitions and shared [`templates/`](./templates) for building, testing, and
releasing the Fluid Framework.

## Checkout history and tags

Use `fetchDepth: 1` and `fetchTags: false` only for jobs that need the checked-out files, not repository history or release tags.
Disabling tag fetching is important: fetching tags can download history even with a shallow checkout.

- Artifact-based client test jobs, real-service test jobs, telemetry uploads, policy checks, and performance tests can use shallow checkouts.
  Any subsequent fetch of a test build's commit must also use `--depth=1 --no-tags`.
- Stress-test change detection needs `fetchDepth: 2` because it runs `git diff HEAD~1`.
  A failed diff must fail the job rather than silently skip tests.
- The bundle-size artifact build skips version generation, so it can use a shallow checkout.
- Other npm and Docker build jobs retain `fetchDepth: 0` and `fetchTags: true`.
  Moving publishing to a separate pipeline does not remove the build's dependency on tags:
  `flub generate buildVersion` checks for existing release tags and computes `isLatest`, which is passed to the publish pipeline in `publish-metadata.json`.
- API-model deployment eligibility also requires release tags for `flub check latestVersions`.
  Coverage comparison jobs retain a complete checkout as a conservative exception.

Do not apply shallow-checkout settings globally or to publishing and website deployment jobs without checking their history and tag requirements.
Full-history settings are explicit in version-generating jobs so pipeline UI defaults cannot silently make their checkouts shallow.

## Mirroring base container images for the server pipelines

The `server-*` pipelines run on a 1ES build pool whose network isolation blocks egress to Docker
Hub, so each server Dockerfile makes its base-image registry overridable via
`ARG BASE_IMAGE_REGISTRY` and CI overrides it to a mirrored copy on a public-accessible ACR
(`fluidmirror-a5dqhgefbwhmbtag.azurecr.io`; the suffix is ACR's Domain Name Label (DNL)
hash, added to the login-server FQDN to prevent subdomain-takeover attacks — `az acr` CLI
commands still take the bare registry name `fluidmirror`). The same mirror is used by both
the `internal` and `public` ADO projects. Local builds default to Docker Hub and need no changes.

```dockerfile
ARG BASE_IMAGE_REGISTRY=docker.io
FROM ${BASE_IMAGE_REGISTRY}/library/node:22.22.2-bookworm-slim@sha256:f3a68cf4...
```

The pipeline doesn't need to set anything explicitly — `build-docker-service.yml` injects the
build-arg automatically via its `baseImageRegistry` parameter, which defaults to the mirror's
FQDN. Callers can override it if they need a different mirror (e.g. for testing).

The mirror namespace `mirror/docker/library/<image>` is byte-identical to Docker Hub's path, so the
same Dockerfile reference works against either registry. Anonymous pull is enabled on the mirror,
so no credentials are needed for the base-image pulls.

### Upgrading a pinned base image

1. Resolve the new tag's Docker Hub manifest digest:
   ```bash
   docker buildx imagetools inspect docker.io/library/node:<new tag> \
     --format '{{json .Manifest.Digest}}'
   ```

2. Import it into the mirror. The command requires permission to perform
   `Microsoft.ContainerRegistry/registries/importImage/action` on `fluidmirror` (held by the
   `Contributor` role, but **not** by `AcrPull`):
   ```bash
   az acr import --name fluidmirror \
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

## Mirroring Debian (apt) packages for the server pipelines

The `server-*` Dockerfiles install OS build dependencies (for native node-gyp modules such as
`zookeeper`) via `apt-get`. To reduce reliance on third-party package feeds, CI installs these from
our own Debian mirror rather than the public Debian CDN. Each server Dockerfile makes its apt host
overridable via `ARG APT_MIRROR` and rewrites `/etc/apt` sources to it before running `apt-get`:

```dockerfile
ARG APT_MIRROR=deb.debian.org
RUN if [ "$APT_MIRROR" != "deb.debian.org" ]; then \
        find /etc/apt -type f \( -name '*.list' -o -name '*.sources' \) \
            -exec sed -i "s/deb.debian.org/$APT_MIRROR/g; s/security.debian.org/$APT_MIRROR/g" {} +; \
    fi
```

`build-docker-service.yml` injects the build-arg automatically via its `aptMirror` parameter (a
drop-in mirror that serves the main, updates, and security suites). The default
`ARG APT_MIRROR=deb.debian.org` means local and external-contributor builds are unaffected and
continue to use the public Debian CDN. If the mirror host changes, update the `aptMirror` parameter
default; no Dockerfile changes are needed.
