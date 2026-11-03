# Work plan: Remove optional fields from SharedTree object schemas

## Status and source

This document describes proposed work for the `@fluidframework/tree` package.
The work is not implemented.

The code investigation used [Fluid Framework commit `7a49a6e`](https://github.com/microsoft/FluidFramework/commit/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7).

## 1. Goal

Let an application remove an optional field from an object schema that enables `allowUnknownOptionalFields`.

When the application opens an existing document, it must treat the removed field as an unknown optional field.
It must also be able to make other compatible schema upgrades.

This behavior supports two primary use cases:

- Rollback of application code that added optional fields to schema.
- Remove experimental features that use optional fields.

### Required behavior

- Preserve the removed field's data in existing documents.
- Preserve its stored field schema and the node schemas needed to interpret that data.
- Preserve this information during later compatible schema upgrades.
- Omit the removed field when the application initializes a new document.
- Require `allowUnknownOptionalFields` on the affected object in the current application schema.
- Keep the existing rules for objects that do not enable this option.
- Continue to reject other incompatible schema changes.

This feature does not delete stored data.
It does not remove the field schema from existing documents.
It does not provide a general schema downgrade operation.

## 2. Terms

| Term | Meaning |
| --- | --- |
| View schema | The schema declared by the application. It determines the properties and types available to application code. |
| Stored schema | The schema saved in a document. It controls the data that the document can contain. |
| Upgrade target | The stored schema that a schema upgrade would write to a particular document. |
| Stored key | The field identifier saved in a document. It can differ from the property name used in application code. |
| Superset check | A check that the new stored schema permits everything that the previous stored schema permits, under the schema upgrade rules. |

See [stored schema types](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/core/schema-stored/schema.ts) and [stored field keys](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/fieldSchema.ts#L100).

## 3. Current behavior

The view compatibility check already accepts unknown optional fields on objects that enable the option.
It does not matter whether another application version added the field or the current version removed it.

See [unknown optional field checks](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/discrepancies.ts#L509).

The restriction occurs when the package constructs an upgrade target:

1. Derive a stored schema from the view schema and the staged upgrade policy.
2. Check that the result permits a superset of the existing stored schema.
3. Write the result if it changes the schema.

The first step has no existing-document input.
Thus, a field absent from the view schema is also absent from the upgrade target.
The superset check rejects the target because it would remove a stored field.

The target is currently constructed in two places:

- [Compatibility calculation](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/schemaCompatibilityTester.ts#L134).
- [Schema upgrade execution](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/shared-tree/schematizingTreeView.ts#L339).

Both use [conversion that has no existing-document input](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/toStoredSchema.ts#L106).

## 4. Required implementation changes

### 4.1 Construct the upgrade target from the view and the document

Add one internal helper for upgrade-target construction.
Use the existing [schema conversion module](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/toStoredSchema.ts) where practical.

The helper needs three inputs:

- The complete view schema.
- The existing stored schema.
- The effective staged upgrade policy.

Use the helper for both compatibility calculation and upgrade execution.
Do not implement separate preservation rules in those paths.

For each affected object type:

1. Derive the application-declared fields with the existing conversion rules.
2. Check that the current view object enables `allowUnknownOptionalFields`.
3. Find stored fields whose stored keys are absent from that view object.
4. Retain each such field only if its stored field kind is optional.
5. Preserve its allowed types and persisted metadata.
6. Include the node schemas needed by the retained fields.

Compare stored keys, not property names.
A property rename that preserves its stored key is not a field removal.

Check the view node kind explicitly.
Arrays also use `ObjectNodeStoredSchema` internally, but this feature must apply only to view object schemas.

### 4.2 Preserve the required node schemas

A removed field can be the only application reference to an entire group of node schemas.
Those schemas can contain objects, arrays, maps, leaf types, and recursive references.

Follow all references from retained fields.
Use a visited set or an equivalent method to handle recursive references.
Do not inspect current tree content to decide which schema definitions to preserve.
A field must remain supported even when it is empty.

For each referenced type:

- If the view does not know the type, retain its existing stored definition.
- If the view knows the type, use the current view definition and the effective staged policy.
- Apply the optional-field preservation rules to view-known object types as needed.
- Do not replace a conflicting current declaration with an old declaration.

Preserve metadata on stored-only definitions.
For view-known definitions, keep the existing metadata conversion behavior.

The final superset check must still cover the complete existing schema repository.
Detached content can use a node schema that is not reachable from the document root.
Do not treat absence from the visible tree as permission to delete a definition.

See [repository-wide superset checks](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/feature-libraries/modular-schema/comparison.ts#L196).

### 4.3 Handle staged schema declarations correctly

Use the complete view definitions when you decide whether the application knows a type.
Do not use only the definitions present in the initially generated stored schema.

The existing conversion removes types that are reachable only through disabled staged declarations.
A retained unknown field can still refer to one of those types.

See [definition filtering](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/toStoredSchema.ts#L192).

For example:

1. A stored optional field refers to type `Detail`.
2. The application removes that field.
3. The application still declares `Detail` through a disabled staged type at another location.
4. The new `Detail` declaration has an incompatible field shape.

If target construction copies the old `Detail` definition, the superset check can pass.
However, the resulting document is still incompatible with the view.

Use the current declaration to detect this conflict.
Also test a compatible version of this case.

Retaining a type definition must not enable that type at another field where the staged policy excludes it.
Keep the existing behavior for staged allowed types, staged optional fields, and already-enabled upgrades.

See [staged upgrade policies](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/core/toStored.ts).

### 4.4 Keep the stored-schema safety rules

Do not weaken the general superset check to permit field deletion.
Instead, construct a target that retains the eligible fields and passes the existing check.

Keep the check in both the compatibility path and the schema update path.
See [schema update enforcement](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/shared-tree/treeCheckout.ts#L2013).

The following changes must remain invalid:

- Remove a required field.
- Remove an optional field from an object not configured with `allowUnknownOptionalFields`.
- Narrow the allowed types of a field that the view still declares.
- Reuse a stored key with an incompatible field schema.
- Reuse a node-type identifier with an incompatible node schema.
- Make an unsupported root or field-kind change.

After a valid upgrade, the resulting stored schema must support the view.
Test this condition as well as the superset condition.

### 4.5 Keep initialization and caches separate

New-document initialization must continue to use only the view schema and its configured staged policy.
It must not add historical fields from another document.

Keep these operations independent of document history:

- Initial stored-schema generation.
- Persisted-schema extraction from an application schema.
- Schema identity hashing for view configuration checks.

See [initial schema generation](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/toStoredSchema.ts#L116) and [schema identity hashing](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/schemaHash.ts#L38).

Do not modify cached conversion results.
The same view configuration can open documents with different historical fields.
Create separate maps for document-specific changes.

Do not cache a target by mutable stored-repository identity alone.
The target must reflect subsequent stored-schema changes.

## 5. Compatibility status and events

Use the same document-specific target for upgrade permission and equivalence.
Keep view compatibility based on the current document.

For a field removal with no other schema change, the proposed result is:

| Property or operation | Expected result |
| --- | --- |
| `canView` | `true` |
| `canUpgrade` | `true` |
| `isEquivalent` | `true` |
| `upgradeSchema()` | No stored-schema change |

Here, equivalence compares the existing stored schema with the target for that document.
It does not mean that a new document would receive the same schema.

For a removal combined with a new optional field:

1. The view cannot access the document until the new field's schema is added.
2. The upgrade retains the removed field and adds the new field.
3. The view can then access the document.
4. A repeated upgrade makes no change.

A no-op upgrade must not submit a schema operation or emit schema-change events.
It must not replace the current view nodes.

Preserve the existing event and view-update behavior when an upgrade changes the stored schema.
Unknown-field content changes must retain their existing notification behavior.

See [compatibility status contracts](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/tree.ts#L1115) and [upgrade execution](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/shared-tree/schematizingTreeView.ts#L339).

## 6. Offline compatibility and snapshot checks

### 6.1 Use the same target construction

Offline compatibility checks must report the same result as a live view with the same inputs.

The existing [persisted-schema comparison](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/storedSchema.ts#L107) calls the shared compatibility implementation.
Keep this connection and add regression tests.

### 6.2 Remove the symmetry assumption for effective-target equivalence

The [snapshot comparison helper](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/snapshotCompatibilityChecker.ts#L905) asserts that equivalence is symmetric.
The proposed target behavior makes that assumption invalid.

Consider two schemas:

- `WithFeature` declares an optional field.
- `WithoutFeature` removes it and permits unknown optional fields.

`WithoutFeature` can use a `WithFeature` document without a stored-schema change.
However, `WithFeature` must add the field schema to a new `WithoutFeature` document before it can use that document.

Update the helper to permit these different results.
Keep the separate `identicalCompatibility` check.
It must still detect the difference between the two application schemas.

### 6.3 Keep the new-document collaboration limit visible

An older client that declares the removed field cannot immediately view a new document that omits the field schema.
The field's optional status does not remove this restriction.
The client may be able to upgrade that document and restore the field schema.

Thus, these cases are different:

- Existing document: the stored field schema is retained.
- New document: the removed field schema is absent.

The snapshot tool can still report a forward-collaboration failure for the new-document case.
Do not suppress that failure or replace the viewing requirement with an upgrade requirement as part of this work.

See [snapshot collaboration checks](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/snapshotCompatibilityChecker.ts#L728).

Clients need the updated `tree` implementation to perform the new preservation-based upgrades.
This change does not update previously deployed package versions.

## 7. Required tests

Use the existing test suites and fixtures.

For every client/document pair in the scenarios below, verify the expected read/write capabilities as well as the schema compatibility status:

- If no upgrade is required, verify that the client can read supported fields and write valid values without upgrading.
- If an upgrade is required, apply the upgrade and verify that the expected reads and writes succeed afterward.
- Verify that unknown optional fields are not exposed as normal view properties and that edits to known fields preserve existing unknown-field data.
- When multiple clients participate, synchronize them and verify that each client can read the resulting values for fields known to its view.

Include these checks within the existing scenarios.

| Area | Required coverage | Existing test location |
| --- | --- | --- |
| Basic removal | Retain an omitted optional field. Verify compatibility and a no-op upgrade. | [Compatibility tests](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/simple-tree/api/schemaCompatibilityTester.spec.ts) |
| Removal and addition | Retain an old field while adding a new field. Verify access after the upgrade. | [Live-view tests](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/shared-tree/schematizingTreeView.spec.ts) |
| Schema definitions | Preserve nested and recursive definitions. Include arrays, maps, shared types, and stored-only types. | [Conversion tests](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/simple-tree/toStoredSchema.spec.ts) |
| Empty fields | Preserve the field schema when no node currently contains field data. | [Unknown-field fixtures](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/testTrees.ts#L673) |
| Stored keys | Distinguish field removal from a property rename that retains its stored key. | [Conversion tests](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/simple-tree/toStoredSchema.spec.ts) |
| Rejected changes | Reject required-field removal, missing opt-in, narrowed types, and incompatible key or identifier reuse. | [Compatibility tests](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/simple-tree/api/schemaCompatibilityTester.spec.ts) |
| Staged changes | Test both compatible and conflicting view-known types filtered from the initial target. Preserve policy behavior at other locations. | [Staged-upgrade tests](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/simple-tree/api/stagedSchemaUpgrade.spec.ts) |
| Data preservation | Verify that retained data survives later upgrades. Reintroduce the field and read the original content. | [Live-view tests](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/shared-tree/schematizingTreeView.spec.ts) |
| Events and repeated calls | Verify that a no-op upgrade submits no schema change and emits no schema-change events. Verify normal events for actual changes. | [Live-view tests](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/shared-tree/schematizingTreeView.spec.ts) |
| New documents and caches | Use one configuration with different document histories. Verify no schema leakage into another document or fresh initialization. | [Conversion tests](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/simple-tree/toStoredSchema.spec.ts) |
| Metadata | Retain metadata on unknown fields and stored-only node definitions. | [Conversion tests](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/simple-tree/toStoredSchema.spec.ts) |
| Offline checks | Verify live/offline agreement, directional equivalence, and the new-document collaboration failure. | [Snapshot tests](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/simple-tree/api/snapshotCompatibilityChecker.spec.ts) and [persisted-schema tests](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/simple-tree/api/storedSchema.spec.ts) |
| Persistence and collaboration | Upgrade through a reduced view, synchronize clients, save a summary, and reload. Verify retained content and schemas. | [SharedTree integration tests](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/test/shared-tree/sharedTree.spec.ts) |

Update existing tests that explicitly expect unknown optional fields to prevent upgrades.
Do not update unrelated expected results.

## 8. Documentation and delivery

Update the following application programming interface (API) documentation:

- [Object schema options](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/schemaFactoryOptions.ts#L14): explain field removal, retained data, and rollback.
- [Upgrade operation](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/tree.ts#L772): describe the document-specific target.
- [Compatibility status](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/tree.ts#L1115): update upgrade and equivalence rules.
- [Snapshot compatibility](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/snapshotCompatibilityChecker.ts): explain directional results and new-document limits.

Update the documentation for `allowUnknownOptionalFields` and the related guides to explain both compatibility directions:

- **Forwards compatibility:** An older view can read and edit a document that contains optional fields added by a newer application version.
- **Backwards compatibility:** A view that removes optional fields can read and edit older documents that still contain them. It can also make later compatible schema upgrades without removing those stored fields.

Do not describe the option only as support for future field additions.
An unknown optional field can come from either a newer schema or an older schema.
Explain that the option does not permit arbitrary incompatible changes or remove the new-document collaboration limits described in section 6.3.

Update the website [schema evolution guide](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/website/docs/data-structures/tree/schema-evolution/index.mdx) to cover this capability:

- Explain how to remove optional fields from view object schemas that enable `allowUnknownOptionalFields`.
- Explain that existing documents retain the fields, their data, and the required stored schemas during later upgrades.
- Include an application rollback example.
- Explain the difference between existing documents and new documents, including the collaboration limits.
- Keep the distinction clear: view schemas can remove eligible fields, but stored schemas remain additive.

Remove the current statement that applications must retain added optional fields forever to permit future upgrades.
Retain the warnings about data loss when applications reconstruct nodes from visible properties.
This feature does not change those operations.

No new public option is proposed.
No persisted format change is expected.
Keep the low-level schema comparison rules, codecs, and general schema-change concurrency behavior unchanged.

Recommended work order:

1. Add target-construction tests and the shared helper.
2. Connect compatibility calculation and upgrade execution to that helper.
3. Update snapshot assumptions and related tests.
4. Add collaboration, persistence, and rollback regression tests.
5. Update documentation and add a changeset for the behavior change.
6. Run focused tests, type checks, and the package's existing lint checks.

Use the [package scripts](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/package.json) and [changeset guidelines](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/.changeset/README.md).
Regenerate API reports if required.
Do not edit generated reports by hand.

## 9. Investigation evidence

The investigation included source inspection and two read-only, in-memory probes against existing compiled package modules.

The probes confirmed:

- The current reduced view can read an old document but cannot upgrade it.
- A target that retains the removed field and its recursive definitions can pass the existing superset check.
- Both the reduced view and the original view can read that example target.
- A new document without the field has different compatibility with the original view.
- Copying an old definition can hide a conflict with a view-known staged declaration.

The probes checked representative schema behavior.
They did not implement the general helper or test persistence.
Full implementation and integration validation remain required.

## Developer's Notes

### Test Cases

Apply the read/write verification requirements in section 7 to every client/document pair below.

The examples below use TypeScript field notation.
For example, `foo?: number` means an optional field named `foo` that allows numbers.
The property names in these examples are also the stored keys.

#### Remove optional field

1. Schema V1 includes `foo?: number`.
2. V2 removes `foo`.

Verify:
- V2 client can open V1 document (no upgrade)
- V1 client can open V2 document (requires upgrade)

#### Remove optional field and add new field

1. Schema V1 includes `foo?: number`.
2. V2 removes `foo` and adds `bar?: string`.

Verify:
- V2 client can open V1 document (requires upgrade)
- V1 client can open V2 document (requires upgrade)

#### Remove optional field and later restore it

1. Schema V1 includes `foo?: number`.
2. V2 removes `foo`.
3. V3 restores `foo?: number`, with the same stored key and allowed type as V1.

Verify:
- V1 client can open V2 document (requires upgrade)
- V1 client can open V3 document (no upgrade)
- V2 client can open V1 document (no upgrade)
- V2 client can open V3 document (no upgrade)
- V3 client can open V1 document (no upgrade)
- V3 client can open V2 document (requires upgrade)

Additional sanity-check verification:
- V1 client can open a V2 document that was previously upgraded by a V3 client (no further upgrade should be required)
- V3 client can open a V2 document that was previously upgraded by a V1 client (no further upgrade should be required)

##### Variation: Restore the field with a wider set of allowed types

1. Schema V1 includes `foo?: number`.
2. V2 removes `foo`.
3. V3 restores the same stored key as `foo?: number | string`.

V3 permits all values allowed by V1, but V1 does not permit all values allowed by V3.
This change supports upgrades in only one direction.

Verify:
- V3 client can open V1 document (requires upgrade to permit strings)
- V1 client can neither view nor upgrade a V3 document
- V1 client can open a document created with V2 that has not been upgraded (requires upgrade)
- V3 client can open a document created with V2 that has not been upgraded (requires upgrade)
- V3 client can open a V2 document that was previously upgraded by a V1 client (requires a further upgrade to permit strings)
- V1 client can neither view nor upgrade a V2 document that was previously upgraded by a V3 client

These expectations apply even when `foo` is empty or contains only a number.
Compatibility depends on the stored schema, not only on the current field value.

#### Remove optional field, then later add a conflicting field with the same name

1. Schema V1 includes `foo?: number`.
2. V2 removes `foo`.
3. V3 adds `foo?: string`, reusing the stored key with an incompatible allowed type.

Verify:
- V1 client can neither view nor upgrade a V3 document
- V3 client can neither view nor upgrade a V1 document
- V1 client can neither view nor upgrade a V2 document that was previously upgraded by a V3 client
- V3 client can neither view nor upgrade a V2 document that was previously upgraded by a V1 client

#### Removing an optional field allows removing a node type only referenced by that field

1. Schema V1 includes `foo?: Foo`, where `Foo` is an object node type with a required `text: string` field. The `Foo` type is *only* used in this location.
2. V2 removes `foo` and also removes the `Foo` type from its schema.

Verify:
- V1 client can open V2 document (requires upgrade)
- V2 client can open V1 document (no upgrade)

#### Repeated upgrades after replacing an optional field

1. Schema V1 includes `foo?: number`.
2. V2 removes `foo` and adds `bar?: string`.
3. Create a document with V1 and populate `foo`.
4. Open it with V2 and upgrade to add `bar` while retaining `foo`.
5. Synchronize both clients, then populate `bar` and synchronize again.
6. Alternate calls to `upgradeSchema()` from V1 and V2, synchronizing after each call.

Verify:
- Both clients can view the document after the initial upgrade.
- The stored schema retains both fields.
- Each client can read and edit its known field without deleting the other field's data.
- After synchronization, both clients report `canUpgrade: true`.
- Each subsequent upgrade call is a no-op: no schema operation, schema-change event, or view node replacement.
- Neither client repeatedly removes and restores the other client's field schema.

Repeat with a document created with V2 and a populated `bar`, then upgrade first with V1.
The final stored schema must be equivalent in both histories.

### Prerequisite Test Cases

These cases protect existing schema safety rules.
They do not require the optional-field preservation feature.
Check the existing tests first and add only missing coverage.
We can add and merge these tests in a separate pull request before implementing the feature.
They must continue to pass after implementation.

For each case, keep the same object type identifier and stored field keys.
Create a document with the original schema, then evaluate the changed view.

| Case | Original schema | Changed view | Expected result |
| --- | --- | --- | --- |
| Remove an optional field without the object option | Object declares `foo?: number`. | Object omits `foo` and does not enable `allowUnknownOptionalFields`. | Cannot view or upgrade. |
| Remove a required field | Object declares required `foo: number`. | Object omits `foo` and enables `allowUnknownOptionalFields`. | Cannot view or upgrade. The option permits only unknown optional fields. |
| Narrow a declared field's allowed types | Object declares `foo?: number | string`. | Object declares `foo?: number` and enables `allowUnknownOptionalFields`. | Cannot view or upgrade. The field is known, so unknown-field tolerance does not apply. |
| Reuse a node-type identifier with an incompatible definition | Object declares `foo?: Foo`. `Foo` has required `text: string`. | Object still declares `foo?: Foo`, but the same `Foo` identifier now has required `text: number`. The object enables `allowUnknownOptionalFields`. | Cannot view or upgrade. Matching identifiers do not make conflicting definitions compatible. |

Verify that rejected upgrade attempts do not change the stored schema or document content.
