# Branches, Versions, and Support Levels

## Development branches

FluidFramework maintains one active development branch, `main`, and an inactive, long-term stable branch, `lts`.

### `main`

`main` branch in used to support our active (development) major release and its subsequent minor versions.
Developers may only merge non-breaking changes into the `main` branch excluding select break windows.
This is enforced by way of automation where open PRs are checked for breaking changes (see also [Breaking vs Non-breaking Changes](./Breaking-vs-Non-Breaking-Changes.md)).
Release branches are created from `main` for each major and minor release.

### `lts`

`lts` is currently used to sustain our 1.x version.

## Versions

FluidFramework packages conform to semantic versioning (semver) for versions `1.0.0` and later.
Major versions are expected to be breaking, minor versions are expected to contain non-breaking incremental changes, and patch versions are expected to contain only bug fixes, security fixes, and other implementation-only changes.
Versions prior to `1.0.0` follow a modified semver using virtual patch versioning.

### Minor Production Releases

Every 2-3 weeks, a client release branch is created from which packages are published to npmjs.

### Major Production Releases

Tentatively every (approximately) 6-9 months, Fluid Framework will release new major version with some breaking changes.

Current long-term supported FF release is 2.x.
The tentative release date for 3.0 is week of 2026-08-24 and 4.0 will be released in 2027.
See [Client 3.0 Breaking Changes](https://github.com/microsoft/FluidFramework/issues/23271) and [Client 4.0 Breaking Changes](https://github.com/microsoft/FluidFramework/issues/27453) for notable planned changes.

## Support Levels

While each of the client releases versioned [major.minor.patch] are production releases, not all accessible code is meant for production.
See [Maintaining API support levels](./Maintaining-API-Support-Levels.md) and customer [API support levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).
