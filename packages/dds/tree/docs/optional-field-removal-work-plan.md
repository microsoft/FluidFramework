# Work plan: Remove optional fields from SharedTree object schemas

## Status and source

This document describes proposed work for the `@fluidframework/tree` package.
The work is not implemented.

The code investigation used [Fluid Framework commit `7a49a6e`](https://github.com/microsoft/FluidFramework/commit/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7).

This document owns the feature requirements, user-facing test scenarios, and delivery checklist.
The [implementation plan][implementation-plan] owns the algorithms, diagnostic contracts, specific code changes, and implementation-level validation.
The [overview][overview] explains the proposal for application authors.

Document links follow the feature branch so they refer to the current plans after publication.
Source-code links remain pinned to the investigation revision.

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
- Require the affected view object's resolved `allowUnknownOptionalFields` setting to be `true`.
- Keep the existing strict rules for objects configured with `allowUnknownOptionalFields: false`.
- Continue to reject other incompatible schema changes.

Object schemas now allow unknown optional fields by default on `main`.
The same preservation rule applies whether that setting comes from the default, factory settings, or an explicit object option.
This broadens the feature's applicability without permitting removal from objects that explicitly disable the option.

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

The restriction affects later upgrades.
Their target is derived from the view schema alone, so it omits fields the application no longer declares.
The stored-schema safety check rejects that target.

See the implementation plan's [code findings][implementation-findings] for the affected functions and call paths.

## 4. Implementation scope

Use the implementation plan as the source for technical decisions:

| Area | Implementation plan section |
| --- | --- |
| Construct a target from the stored and view schemas and the effective staged-upgrade policy | [Shared upgrade-target construction][implementation-target] |
| Preserve referenced types, handle staging, and isolate cached results | [Shared upgrade-target construction][implementation-target] |
| Compute compatibility flags and execute safe upgrades | [Compatibility and upgrade execution][implementation-runtime] |
| Explain retained fields separately from viewing blockers | [Informational diagnostics][implementation-diagnostics] |
| Update offline comparisons and snapshot assumptions | [Snapshot and offline checks][implementation-snapshots] |

Keep detailed algorithms and diagnostic shapes there rather than duplicating them in this document.
The requirements and scenarios here remain the basis for acceptance.

## 5. Compatibility status and events

The implementation must meet these application-facing expectations.
The [calculation and execution details][implementation-runtime] are defined in the implementation plan.

For a field removal with no other schema change, the proposed result is:

| Property or operation | Expected result |
| --- | --- |
| `canView` | `true` |
| `canUpgrade` | `true` |
| `isEquivalent` | `true` |
| `upgradeSchema()` | No stored-schema change |

Here, equivalence compares the existing stored schema with the target derived from both schemas and the effective staged-upgrade policy.
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

Applications must also be able to identify fields retained by an upgrade without treating them as compatibility errors.
See the [informational diagnostic contract][implementation-diagnostics].

## 6. Offline compatibility and snapshot checks

### 6.1 Match live compatibility results

Offline compatibility checks must report the same result as a live view with the same inputs.
The implementation plan defines the [shared calculation and affected helpers][implementation-snapshots].

### 6.2 Preserve directional compatibility results

A reduced view can use a historical document without changing its stored schema.
The original view may need to upgrade a newly created reduced document.
Snapshot comparisons must preserve these different results.
See the implementation plan's [snapshot changes][implementation-snapshots] for the necessary code updates.

### 6.3 Keep the new-document upgrade requirement visible

An older client that declares the removed field cannot immediately view a new document that omits the field schema.
The field's optional status does not remove this restriction.
The client may be able to upgrade that document and restore the field schema.

Thus, these cases are different:

- Existing document: the stored field schema is retained.
- New document: the removed field schema is absent.

The snapshot tool accepts direct viewing or a safe upgrade in both directions.
The current client must be able to view or upgrade documents from every historical snapshot.
Within the configured collaboration window, each historical client must also be able to view or upgrade documents created with the current schema.
Clients that can already view but cannot upgrade remain accepted; clients that can do neither are rejected.

This changes snapshot validation policy, not the meaning of `canView` or the runtime upgrade rules.
Applications must still perform the required upgrade before accessing the document through an incompatible view.
Keep the existing collaboration version window unchanged; excluding older clients does not remove the requirement for the current client to support their documents.

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

The Developer's Notes below define the scenario matrix and separate prerequisite safety checks.
The [user-story fixture][scenario-tests] contains the executable scenarios.
Do not weaken those assertions to accommodate the implementation.

The implementation plan specifies the [focused regression tests and affected test helpers][implementation-tests].
Use that list for target construction, caching, metadata, staged definitions, diagnostics, and offline checks.

Also verify that retained schema and content survive synchronization, summary creation, and reload through the existing integration tests.
The implementation plan contains the [validation commands and code-work order][implementation-validation].

## 8. Documentation and delivery

Update the following application programming interface (API) documentation:

- [Object schema options](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/schemaFactoryOptions.ts#L14): explain field removal, retained data, and rollback.
- [Upgrade operation](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/tree.ts#L772): describe how the stored and view schemas and the effective staged-upgrade policy determine the target.
- [Compatibility status](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/tree.ts#L1115): clarify `isEquivalent` and the upgrade rules according to the implementation plan's [flag definitions][implementation-runtime]. Keep the existing property name; renaming and deprecation are out of scope.
- [Snapshot compatibility](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/snapshotCompatibilityChecker.ts): explain directional results and accept direct viewing or a safe upgrade in both directions.

Document the new alpha informational report according to the [diagnostic contract][implementation-diagnostics].
Include an example that distinguishes retained fields from blocking discrepancies.
Leave the existing beta `discrepancies` contract unchanged; redesigning it is outside this project.

Update the documentation for `allowUnknownOptionalFields` and the related guides to explain both compatibility directions:

- **Forwards compatibility:** An older view can read and edit a document that contains optional fields added by a newer application version.
- **Backwards compatibility:** A view that removes optional fields can read and edit older documents that still contain them. It can also make later compatible schema upgrades without removing those stored fields.

Do not describe the option only as support for future field additions.
An unknown optional field can come from either a newer schema or an older schema.
Explain that the option does not permit arbitrary incompatible changes or remove the new-document upgrade requirement described in section 6.3.

Update the website [schema evolution guide](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/website/docs/data-structures/tree/schema-evolution/index.mdx) to cover this capability:

- Explain how to remove optional fields from view object schemas that enable `allowUnknownOptionalFields`.
- Explain that existing documents retain the fields, their data, and the required stored schemas during later upgrades.
- Include an application rollback example.
- Explain the difference between existing documents and new documents, including upgrades required before collaboration.
- Keep the distinction clear: view schemas can remove eligible fields, but stored schemas remain additive.

Update the [types-of-schema-changes guide](https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/website/docs/data-structures/tree/schema-evolution/types-of-changes.mdx) as well.
Distinguish removing an eligible optional field from removing a required field.
Do not change versioned documentation for releases that lack this capability.

Remove the current statement that applications must retain added optional fields forever to permit future upgrades.
Retain the warnings about data loss when applications reconstruct nodes from visible properties.
This feature does not change those operations.

No new public option is proposed.
No persisted format change is expected.
Keep the low-level schema comparison rules, codecs, and general schema-change concurrency behavior unchanged.

Delivery checklist:

- Complete the [implementation steps and focused validation][implementation-validation].
- Complete the documentation updates in this section.
- Follow the repository API-change review guidance for the new alpha status type and property.
- Regenerate the affected API reports for both `@fluidframework/tree` and its `fluid-framework` aggregator. Do not edit reports by hand.
- Regenerate entrypoint sources for the new alpha status type, then rebuild before generating reports.
- Add a changeset for both packages covering field-preserving upgrades and the informational diagnostic.

Use the [package scripts](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/package.json) and [changeset guidelines](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/.changeset/README.md).

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

[implementation-plan]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-implementation-plan.md
[implementation-findings]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-implementation-plan.md#1-findings-from-the-code
[implementation-target]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-implementation-plan.md#2-shared-upgrade-target-construction
[implementation-runtime]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-implementation-plan.md#3-compatibility-and-upgrade-execution
[implementation-diagnostics]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-implementation-plan.md#4-informational-diagnostics
[implementation-snapshots]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-implementation-plan.md#5-snapshot-and-offline-checks
[implementation-tests]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-implementation-plan.md#7-test-work
[implementation-validation]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-implementation-plan.md#8-implementation-order-and-validation
[overview]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-overview.md
[scenario-tests]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/test/feature-libraries/modular-schema/schemaEvolutionExamples.spec.ts

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
| Remove an optional field with unknown optional fields disabled | Object declares `foo?: number`. | Object omits `foo` and explicitly sets `allowUnknownOptionalFields: false`. | Cannot view or upgrade. |
| Remove a required field | Object declares required `foo: number`. | Object omits `foo` and enables `allowUnknownOptionalFields`. | Cannot view or upgrade. The option permits only unknown optional fields. |
| Narrow a declared field's allowed types | Object declares `foo?: number | string`. | Object declares `foo?: number` and enables `allowUnknownOptionalFields`. | Cannot view or upgrade. The field is known, so unknown-field tolerance does not apply. |
| Reuse a node-type identifier with an incompatible definition | Object declares `foo?: Foo`. `Foo` has required `text: string`. | Object still declares `foo?: Foo`, but the same `Foo` identifier now has required `text: number`. The object enables `allowUnknownOptionalFields`. | Cannot view or upgrade. Matching identifiers do not make conflicting definitions compatible. |

Verify that rejected upgrade attempts do not change the stored schema or document content.
