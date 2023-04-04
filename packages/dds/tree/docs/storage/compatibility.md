# Compatibility

This document provides concrete guidelines and strategies for organizing code that impacts SharedTree's persisted format.
It then pivots to the current state of SharedTree's persisted format, and outlines steps to take to align the implementation
with those guidelines.

## Prerequisites

[This document](../../../SchemaVersioning.md) provides general "best practices" for working with persisted data within the Fluid Framework.
It's strongly recommended to read through and understand its rationale before continuing with this document,
as most of the concrete recommendations presented henceforth fall out of those best practices.

## What State is Persisted?

A DDS's persisted format encompasses the format it uses for its summaries as well as its ops (due to [trailing ops](../../../README.md))
including transitively referenced structured blob data.

Since documents are stored outside of Fluid control (i.e. no type of central data migration is possible),
DDSes necessarily commit to backwards compatibility of their format for all time.

## Format Management

The actively used format is stored and managed by an `IPersistedConfigStore`.
This configuration dictates all pieces of policy which impact the set of allowed ops, write format, etc.

This config store is serialized at summarization time,
which ensures all SharedTree summaries contain sufficient format version information.

Configuration should be specifiable by application authors via `SharedTreeFactory`:
this ensures applications can control rollout of configuration changes which require code saturation of some prior version.

TODO: decide how many format version / flags there should be (format per-index vs. single version)

## Code Organization

Each part of SharedTree which contributes to the persisted format should define:

1. A type defining the _in-memory format_ needed to load or work with its data
1. A set of versioned _persisted formats_ which encompass all supported formats in the current and past.
1. An `ICodecFamily` capable of transcoding between the in-memory format and all supported persisted formats.

Split the above components into files as is reasonable:
a simple index with only one persisted format could put all of the above into a single file,
whereas an index with back-compat support for a large number of fairly dissimilar formats would be better organized with each version and its codec
in a separate file.
To make changes to persisted formats obvious at review time,
such files should either end in `PersistedFormat` or be located in a `persisted-format` folder.
Primitive types which are used in persisted formats but don't intrinsically define formats (such as branded strings) should be placed in a file ending in `PersistedTypes` if they aren't already defined in a `PersistedFormat` file.
Codec logic should generally be self-contained: it should only import from other files with persisted format guarantees. TODO: How can it reference in-memory types?
Importing Fluid Framework libraries that have the same guarantees (e.g. `SummaryTreeBuilder`) is also acceptable.
Codecs should expose the minimal necessary set of types.
Encoding should take care to only include necessary object properties, avoiding constructs like object spread.
Decoding should validate that the data is not malformed.

With the exception of primitives, storage format types should never be exposed in the public API.

Using this structure, SharedTree will have access to a library of codecs capable of encoding/decoding between
the in-memory format and some persisted format.
It should use the format information determined by its configuration store to decide which codec to use when transcoding data.
For example:

-   On encoding ops or summaries, it should use the format described by `configStore.getConfigForNextSubmission()`.
-   On decoding an acked op, it should use the format described by `configStore.getConfigForMessage(op)`.
-   On op resubmission, it should re-encode the op if the configuration has changed since the op was originally submitted.

## Test Strategy

This section covers types of tests to include when adding new persisted configuration.

There are a couple different dimensions to consider with respect to testing:

1. SharedTree works correctly for all configurations it can be initialized in when collaborating with SharedTrees with similar configuration
1. SharedTree can correctly execute document upgrade processes (changes to persisted configuration)
1. SharedTree is compatible clients using different source code versions of SharedTree (and the documents those clients may create)

### Configuration Unit Tests

Each codec family should contain a suite of unit tests which verify the in-memory representation can be round-tripped through encoding and decoding.
When adding a new codec version, the test data for this suite should be augmented if existing data doesn't yield 100% code coverage on the new
codec version.

If the persisted configuration impacts more than just the data encoding step,
appropriate unit tests should be added for whatever components that configuration impacts.
As a simple example, a persisted configuration flag which controls whether SharedTree stores attribution information
should have unit tests which verify processing ops of various sorts yield reasonable attribution on the parts of the tree they affect.

### Multiple-configuration Functional Tests

In addition to targeted unit tests, we should modify a small set of functional acceptance tests
(e.g. `sharedTree.spec.ts`) to run for larger sets of configurations.
Using `generatePairwiseOptions` will help mitigate the combinatorial explosion concern.
In the same vein, fuzz tests should cover a variety of valid configurations (TODO: Settle on model).

These tests in aggregate will verify that SharedTree works when initialized with some particular configuration
and collaborates with other SharedTree instances initialized with the same configuration.
They would reasonably detect basic defects in codecs or problems unrelated to backwards compatibility or the upgrade process.

### Persisted Configuration Store Tests

The persisted configuration store's own unit tests and fuzz testing verify that the upgrade scheme it uses generally works.
SharedTree should have a suite of tests which verify its integration of the store into its op processing.
These tests generally won't be necessary to modify when adding new formats or persisted configuration.

### Configuration-specific Upgrade Tests

The persisted configuration store tests and its integration tests into SharedTree will verify that the scheme for upgrading
configuration generally works correctly, but they can't generically exercise logic specific to some particular format change.
Any format change which is more involved than an encoding change should have some targeted tests which verify interesting aspects of the upgrade process work correctly.
For example, legacy SharedTree's introduction of IdCompressor involved [testing the upgrade process](../../../../../experimental/dds/tree/src/test/utilities/SharedTreeVersioningTests.ts) and specifically the synchronization point logic (see 'generates unique IDs after upgrading from 0.0.2').

These tests should cover logic invoked as part of `onProtocolChange` and `reSubmitPendingOps`.

### Snapshot Tests

The last dimension of compatibility concerns direct or indirect collaboration between clients using different versions of SharedTree source code.
This is a vast area that could use more well-established framework testing support, but snapshot testing is a relatively effective category for
catching regressions.

The idea behind snapshot testing is to verify a document produced using one version of the code is still usable using another version of the code.
It's typically implemented by writing some code to generate a set of fixed documents "from scratch," then source-controlling the serialized form
of those documents after summarization.
Since the serialized form of the documents correspond to documents produced by an older version of the code, this enables writing a test suite that verifies:

1. The current version of the code serializes each document to exactly match how the older version of the code serialized each document.
1. The current version of the code is capable of loading documents written using older versions of the code.

A few examples (which may be exhaustive) of snapshot tests are:

-   [Legacy SharedTree](../../../../../experimental/dds/tree/src/test/Summary.tests.ts)
-   [Sequence / SharedString](../../../sequence/src/test/snapshotVersion.spec.ts)
-   [e2e Snapshot tests](../../../../test/snapshots/README.md)

The first two examples generate their "from scratch" documents by directly calling DDS APIs on a newly created document.
The e2e snapshot tests accomplish "from scratch" generation by serializing the op stream alongside the snapshots and replaying it.
In addition to verifying serialized states line up between old and current version of the code, it can also be helpful to
verify equivalence at runtime, which typically gives more friendly error messages.

Snapshot tests are effective at catching changes which inadvertently modify the document format over time.
SharedTree should have snapshot testing for each of its supported configurations.

## Current State

Since a DDS has effectively 2 ways of creating persisted state (summaries and ops),
one can audit both sources to find all code that impacts persisted state as follows:

1. Locate all calls to `submitLocalMessage` and determine the format for data that can used for a message's contents.
1. Locate all code which `summarizeCore` transitively invokes and determine the format for data that it can return.

In addition to the code that impacts the content of persisted state, one should also inspect code which interprets persisted state.
This can be accomplished using `processCore`, `reSubmitCore`, `applyStashedOp`, and `loadCore`.
Doing so for the current SharedTree yields the following areas.

### Summary Format

SharedTreeCore summarizes each of its indexes in its own summary tree.

A sample summary which is partially beautified is shown below, taken from a test involving summarization:

```json
{
	"type": 1,
	"tree": {
		"indexes": {
			"type": 1,
			"tree": {
				"Schema": {
					"type": 1,
					"tree": {
						"SchemaString": {
							"type": 2,
							"content": "{\"version\":\"1.0.0\",\"treeSchema\":[{\"name\":\"TestValue\",\"extraGlobalFields\":false,\"extraLocalFields\":{\"kind\":\"Sequence\"},\"globalFields\":[\"globalFieldKey\"],\"localFields\":[{\"kind\":\"Optional\",\"types\":[\"TestValue\"],\"name\":\"optionalChild\"}],\"value\":0}],\"globalFieldSchema\":[{\"kind\":\"Value\",\"name\":\"globalFieldKey\"},{\"kind\":\"Value\",\"name\":\"rootFieldKey\"}]}"
						}
					}
				},
				"Forest": {
					"type": 1,
					"tree": {
						"ForestTree": {
							"type": 2,
							"content": "\"[{\\\"type\\\":\\\"Node\\\",\\\"value\\\":42}]\""
						}
					}
				},
				"EditManager": {
					"type": 1,
					"tree": {
						"String": {
							"type": 2,
							"content": "{\"trunk\":[{\"revision\":\"2f50a3e1-8f1d-46f8-8ff4-bfb9794ecf66\",\"sessionId\":\"f7d3609f-f3c6-4a46-9742-40f4e8b2beee\",\"change\":{\"changes\":[{\"fieldKey\":\"rootFieldKey\",\"keyIsGlobal\":true,\"fieldKind\":\"Sequence\",\"change\":[{\"type\":\"Insert\",\"content\":[{\"type\":\"Node\",\"value\":42}]}]}]},\"parent\":{\"revision\":\"00000000-0000-4000-8000-000000000000\",\"sessionId\":\"\",\"change\":{\"changes\":{}}},\"sequenceNumber\":6}],\"branches\":[[\"f7d3609f-f3c6-4a46-9742-40f4e8b2beee\",{\"base\":\"2f50a3e1-8f1d-46f8-8ff4-bfb9794ecf66\",\"commits\":[]}]]}"
						}
					}
				}
			}
		}
	}
}
```

At the top level, the main thing to call out is that `SummaryElement.key` ends up persisted in addition to all of the blob name keys.

#### SchemaIndex

There is a very small amount of code directly in `summarize` and `load` which handles building a summary tree / fetching the contents
of the write blob in the summary tree, but the bulk of the encoding functionality and types live in `schemaIndexFormat.ts`.

This structure generally aligns with the proposed guidelines and would largely just need some renames for consistency.

#### ForestIndex

-   Logic to generate and interpret the summary is somewhat inlined / spread across a few files.
-   Most "codec" code and types live in `treeTextFormat.ts` or `treeTextCursor.ts`. Both files document
    their behavior reasonably enough, but could be refactored to work . `singleStackTreeCursor` in `TreeCursorUtils` is also invoked.
-   Some encode/decode is done in ForestIndex itself; it could logically fit into the encoder paradigm instead if we used `ITreeCursorSynchronous[]` as the in-memory format.
-   ForestIndex calls into a few helpers in `treeTextCursor.ts` for decode/code which should probably live in `treeTextFormat` - For encode: `jsonableTreeFromCursor` - For decode: `singleTextCursor` -

In general, the load process for `ForestIndex` is significantly more implicit than other indexes--it constructs its in-memory representation (a list of cursors) directly over the summary contents.

It also does double-stringify, which is also not ideal.

#### EditManagerIndex

Uses the type `SummaryData<TChangeset>` for its in-memory representation.
Translates this to a persisted type using an injected `encoder` from the change family.
Spread operations in `editManagerIndex.ts`'s `stringifySummary` are mildly concerning.

Main complaint with this setup organizationally is it can be difficult to locate all of the places that encode persisted state.
Example encoders:

-   `sequenceChangeEncoder`
-   `ModularChangeEncoder`
-   all encoders in `defaultFieldKind.ts`

It also might make sense to put the logic in `stringifySummary` into an encoder that composes over the change family encoder.

### Op Format

There's only one call to `submitLocalMessage`:

```typescript
const message: Message = {
	revision: commit.revision,
	originatorId: this.editManager.localSessionId,
	changeset: this.changeFamily.encoder.encodeForJson(formatVersion, commit.change),
};
this.submitLocalMessage(message);
```

This shares the same general encoding concerns as `EditManagerIndex`'s summarization logic (it reuses the same encoder).
