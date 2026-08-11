These snapshot tests exist to validate the backward-compatibility of the persisted format of shared-tree.

This is useful in two scenarios:

1. Identifying unintentional changes to the persisted format
2. Making it possible to diff intentional changes in the persisted format.

The trees in this test suite are intended to exercise end-to-end tree construction cases with interesting edit history and internal state, not just those having interesting shapes.

Additionally, there are some tests that validate only the persisted format of
the schema. These tests exist to test interesting tree schemas and make it easier
to diff changes to just the persisted format of the schema.

### Running

Snapshot tests are run as part of the regular test run (`npm run test`).

To run them in isolation, you can run `npm run test:snapshots` from the `tree2` package.

### Updating and Regenerating

If adding a new test or if you've intentionally made a change to the persisted format, you will have to regenerate the test files. To do so, you can run: `npm run test:snapshots:regen`.

This command updates all snapshots in this folder -- both whole trees and schemas.

### Unintentional Changes

If you find that the snapshot tests break, this means you've modified the persisted format of SharedTree. This generally comes with compatibility consequences:

1. Can previous versions of `@fluidframework/tree` correctly parse the content of the new snapshot?
2. Can the current version of `@fluidframework/tree` correctly parse snapshots that might exist "in the wild?"

If the answer is "yes" to both questions, you can update the snapshots by [regenerating the snapshots](#updating-and-regenerating). Otherwise, your feature needs careful planning with compatibility in mind: see [schema versioning.md] for some best practices.

[schema versioning.md]: packages/dds/SchemaVersioning.md
