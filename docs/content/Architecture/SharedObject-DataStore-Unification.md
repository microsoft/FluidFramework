# Shared object and data store unification follow-up

This temporary checklist records validation work remaining after implementation.
Remove it and its architecture-index entry after the checks below pass.
Durable contracts are documented in the shared-object-base and container-runtime READMEs and API comments.
Legacy bridge usage is documented in the runtime-utils README.
Migration-test guidance is documented in the end-to-end testing README.

## Older-framework interoperability

- [ ] Exercise a supported, pinned older framework implementation against the current generalized collection, not only different APIs from the current packages.
- [ ] Verify bidirectional edits, handles, live child creation, signals, and summary reloads in both directions without changing the existing DDS layout.
- [ ] Use version-specific loaders, runtimes, and DDS factories so the fixture cannot silently substitute current implementations.

The existing legacy bridge, native collection, and leaf suites use `NoCompat`.
They establish same-version behavior, not older-framework compatibility.

## Garbage-collection lifecycle

- [ ] Verify through actual GC execution that a descendant-only reference retains its ancestors and their bound children.
- [ ] Remove the external reference and verify the aggregate becomes unreferenced despite internal cycles.
- [ ] Verify tombstoning, sweeping, and summary reload remove the unreachable container-level item and its nested contents without removing a reachable sibling.
- [ ] Cover directly hosted container-level leaves as independent collection units.

The existing native collection suite checks GC graph edges, not tombstone or sweep execution.

## Signal routing and failure boundaries

- [ ] Extend the existing broadcast and nested-signal tests to verify targeted delivery and isolation from sibling collections.
- [ ] Verify rejected composite creation and nested aliases leave no unsupported persisted state, and that supported DDS operations still work afterward.
- [ ] Cover malformed collection metadata and invalid or duplicate child IDs.
- [ ] Verify root-creation failures, including concurrent creation, do not bypass the single-root contract.

Legacy broadcast and nested payload preservation already have coverage; they do not need replacement tests.
The remaining tests must use bounded waits and exercise the specific failure or delivery condition.

## Consumer-facing validation

- [ ] Exercise unified kinds, registries, roots, and additional contents through the exported alpha entry points in import-testing.
- [ ] Include lazy kinds and application values without handles.
- [ ] Compile and run the consumer tests, rather than relying solely on tests importing internal modules.

## Focused validation commands

Compile the affected implementations and tests before running these commands.
The compatibility follow-up must additionally run against its selected older version.

From `packages/test/test-end-to-end-tests`:

```sh
MOCHA_SPEC=lib/test/legacyDataStoreKinds.spec.js npm run test:realsvc:local -- --compatVersion=0 lib/test/nativeChannelCollections.spec.js lib/test/leafChannels.spec.js
```

From `examples/utils/import-testing`:

```sh
npm run build:test:esm
MOCHA_SPEC=lib/test/apiExamples.spec.js npm run test:mocha:esm
```
