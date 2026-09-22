# Wrappers

The packages formerly grouped here now live directly under `crates/`.

- [`sea-compression/`](../sea-compression/) and [`sea-encryption/`](../sea-encryption/) decorate `SeaSession` values.
- [`sea-webtransport/`](../sea-webtransport/) provides native/browser transports and session dispatch.

This directory remains only as a historical grouping-document location.

Payload wrappers preserve underlying availability handles, stored identity references, progress, and classified errors.
For authenticated compression, place compression outside encryption.
