# Test fixtures

These files are captured registry responses for `semver@7.7.3` from `registry.npmjs.org`:

- `semver-7.7.3-attestations.json`: the response from `https://registry.npmjs.org/-/npm/v1/attestations/semver@7.7.3`.
- `semver-7.7.3-manifest.json`: the version's manifest, trimmed to the fields the checker reads.

They duplicate data that could be fetched over the network so that the provenance tests can perform real Sigstore verification offline and deterministically.
Public registries are commonly blocked on internal networks, and registry responses can change over time.
Do not edit the base64-encoded payloads or signatures in the attestations; signatures cover the exact payload bytes.

The Sigstore trusted root is not duplicated here; the tests read the one that `@sigstore/tuf` ships in `seeds.json`.
