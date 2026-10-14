---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add application-defined schema versions to SharedTree

SharedTree now supports optional application-defined schema versions through [`TreeViewConfigurationAlpha`](https://fluidframework.com/docs/api/fluid-framework/treeviewconfigurationalpha-class).
Version maps use non-negative safe integers keyed by [`LibraryId`](https://fluidframework.com/docs/api/fluid-framework/libraryid-typealias), allowing each library or component to manage its own version.
Library identifiers are persisted and must be stable, globally unique, and namespaced, such as a package name or domain-based name.

Increasing a version is required when a schema change keeps every existing document valid but does not only expand what may be stored.
Existing versions cannot decrease or be removed.
This prevents older applications from reversing the change and repeatedly conflicting with newer applications.
For changes that only expand what may be stored, increasing a version is optional but can still be useful for identifying application schema revisions in telemetry and compatibility snapshots.
When a hashed schema changes only persisted metadata without expanding what may be stored, at least one application version must increase.
Versioned schemas use an experimental persisted format.
Every client that loads or collaborates on a versioned document must use the same Fluid Framework version until this format is stabilized.
Applications using schema versions must configure SharedTree to write the experimental schema format, as shown below.

Versioned schemas also require an application-supplied `schemaHash` and the separately imported `schemaHasher` when initializing or upgrading a tree.
Generate the expected hash during development and store it in application source.
When you change the effective schema, regenerate the hash and update the corresponding constant.
Computing the expected hash on every launch cannot detect a forgotten hash update.
Unversioned schemas may opt into the same validation by supplying a hash and hasher.
Persisting hashes without versions also requires configuring SharedTree to write the experimental schema format.
Once the stored schema has a hash, subsequent upgrades must supply a valid hash and hasher and cannot remove the hash.
Applications without schema versions that do not opt into hashing need neither a hash nor a hasher, and bundlers can omit the hashing implementation when it is not imported.

Hashes describe the effective stored schema after applying staged-upgrade flags, including persisted metadata.
Use the same flags with `computeSchemaHash` as with the view's staged-upgrade policy, including upgrades already enabled in the document.
Object, field, definition, and allowed-type insertion order do not affect the hash.
Application versions and non-persisted view metadata are excluded.
The fingerprint is a hexadecimal SHA-256 digest.

For example, changing a required string field to an identifier field is not normally allowed.
Both fields accept the same stored values, so increasing the application version allows it.

#### Step 1: Define the latest schema

In `schema.ts`, replace the previous string schema with an identifier schema:

```typescript
import { SchemaFactory } from "fluid-framework/alpha";

const schemaFactory = new SchemaFactory("com.example");
export const schema = schemaFactory.identifier;
```

#### Step 2: Compute the expected hash during development

Run a development-time script that imports the latest schema:

```typescript
import { computeSchemaHash } from "fluid-framework/alpha";
import { schema } from "./schema.js";

console.log(computeSchemaHash(schema));
```

#### Step 3: Store the result and configure the application

Copy the result into application source and commit it with the schema.
Only the latest schema hash needs to be kept in source code; you do not need to retain hashes for previous schema versions to upgrade existing documents.
Replace the previous hash constant and increase the application version from `0` to `1`:

```typescript
import {
	configuredSharedTreeAlpha,
	type LibraryId,
	schemaHasher,
	TreeViewConfigurationAlpha,
} from "fluid-framework/alpha";
import { schema } from "./schema.js";

const libraryId = "com.example" as LibraryId;
const schemaHash =
	"eb816accf738b52fbcfbe0044400ab0c4be1e67ca48f99ac65edad90b5dda0f4";
const SharedTree = configuredSharedTreeAlpha({
	allowPossiblyIncompatibleWriteVersionOverrides: true,
	writeVersionOverrides: new Map([["Schema", "schemaVersion"]]),
});

const config = new TreeViewConfigurationAlpha({
	schema,
	schemaVersion: { [libraryId]: 1 },
	schemaHash,
	schemaHasher,
});
```

The configured and stored versions are available from [`TreeViewAlpha`](https://fluidframework.com/docs/api/fluid-framework/treeviewalpha-interface), and the stored versions are also available from [`ITreeAlpha`](https://fluidframework.com/docs/api/fluid-framework/itreealpha-interface).
Schema compatibility snapshots preserve configured version maps and their associated expected schema hashes.
Applications using version maps must supply a schema hash when initializing or upgrading a tree; applications without version maps may opt into hashing.
The new snapshot v2 supports schema hashes with optional application versions.
Snapshots with application versions require a non-empty hash; unversioned snapshots may omit it.

Initialization and upgrades throw a `UsageError` before changing the tree if a schema that requires hashing has a missing or incorrect hash or hasher.
A valid hash does not replace the existing compatibility and version-increase rules.
The hash is stored alongside the schema versions in operations and summaries.
The configured and stored hashes are available on `TreeViewAlpha`; the stored hash is also available on `ITreeAlpha`.
Versioned stored schemas and versioned compatibility snapshots must include a non-empty hash.
