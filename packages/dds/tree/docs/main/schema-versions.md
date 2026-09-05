# Application-Defined Schema Versions

## Status

Implemented as an experimental alpha feature.

## Summary

Applications can associate optional version information with a SharedTree schema.
Versions allow schema upgrades that preserve the validity of existing data but are not normally allowed because they do more than expand what may be stored.
They also provide application-defined schema identifiers for telemetry.

The version information is a `SchemaVersionMap`: a map from a branded `LibraryId` to an integer greater than or equal to zero.
Using one entry per library or component lets independently developed parts of an application manage their own versions.

## Motivation

SharedTree normally allows schema upgrades only when they expand what may be stored.
This restriction prevents two application versions from repeatedly applying inverse schema changes, but it also prevents useful changes such as switching in both directions between fields that accept the same stored values.
Persisted metadata changes can encounter the same limitation.

Application-defined versions identify which schema is newer.
An upgrade that does more than expand what may be stored must increase at least one version and may not decrease or remove any existing version.
An older application therefore cannot reverse the upgrade.

## API

The version map uses the following alpha types:

```typescript
type LibraryId = string & { readonly "tree.LibraryId": "tree.LibraryId" };
type SchemaVersionMap = Readonly<Record<LibraryId, number>>;
```

Each version must be a non-negative integer.
Library identifiers should be namespaced to avoid collisions.

Applications provide the map through `TreeViewConfigurationAlpha.schemaVersion`:

```typescript
const appLibraryId = "com.example.app" as LibraryId;

const config = new TreeViewConfigurationAlpha({
	schema: AppSchema,
	schemaVersion: {
		[appLibraryId]: 2,
	},
});
```

`TreeViewAlpha.schemaVersion` exposes the map declared by the view configuration.
`TreeViewAlpha.storedSchemaVersion` exposes the map currently stored in the document.
`ITreeAlpha.storedSchemaVersion` provides the stored map without requiring a view.

The stored value can differ from the configured value before initialization, while a schema upgrade is pending, or when another client updates the stored schema.
The stored value changes with the stored schema and can be observed through `TreeViewEvents.schemaChanged`.

## Upgrade Rules

Given stored schema `S_old` with optional versions `V_old` and proposed schema `S_new` with optional versions `V_new`, an upgrade is allowed when either:

1. `S_new` only expands what may be stored compared with `S_old`, and `V_new` does not decrease or remove any entry from `V_old`.
2. `S_new` accepts every document accepted by `S_old`, both version maps are defined, `V_new` does not decrease or remove any entry, and at least one entry increases or is added.

Introducing versions through an upgrade that only expands what may be stored, or changes no schema constraints, is allowed.
Once versions are stored, they cannot be removed.
An upgrade that does more than expand what may be stored cannot proceed directly from an unversioned schema, so it must first introduce a version without changing schema constraints.

For example, after a document moves from version 1 to version 2 using a change that does more than expand what may be stored, a client configured with version 1 cannot reverse that change because doing so would decrease the stored version.

### Multiple components

Each component owns an entry:

```typescript
const versions: SchemaVersionMap = {
	["com.example.canvas" as LibraryId]: 3,
	["com.example.comments" as LibraryId]: 2,
};
```

A component bump must preserve the current values of all other entries.
Concurrent clients with stale maps may conflict; the application can read the stored map, merge it by taking the maximum value for each entry, and retry with its own entry increased.

## Persisted Format

Schema versions use the experimental `SchemaFormatVersion.v3Experimental` discriminator, `"schemaVersion"`.
The format is selected automatically whenever stored schema includes a version map.
Unversioned schemas continue using the stable format selected by the existing codec options.
An explicit format override that cannot represent versions causes encoding to fail rather than silently omitting the map.

The map is encoded as an array of `[LibraryId, version]` pairs sorted lexically by `LibraryId`.
For example:

```json
[
	["com.example.canvas", 3],
	["com.example.comments", 2]
]
```

The deterministic order improves summary reuse and makes encoded schema diffs stable.
Decoding rejects unsorted entries, duplicate identifiers, and values that are not non-negative integers.

The experimental string discriminator follows the precedent of the collaborative text format.
It allows the representation to change before stabilization without reserving numeric format version 3.
A stabilized form can later adopt a numeric discriminator.

## Compatibility Snapshots

Schema compatibility snapshots include the optional version map using the same sorted-pair encoding.
Exporting and importing a snapshot preserves the configured versions, and compatibility checks apply the same upgrade rules as runtime schema upgrades.

This makes a version change visible in source control and lets snapshot-based compatibility tests detect a change that requires but omitted a version increase.
Existing snapshots without versions remain valid.
