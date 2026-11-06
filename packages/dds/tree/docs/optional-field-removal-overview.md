# Proposal: Compose SharedTree schema upgrades without removing stored permissions

**Status:** Optional-field preservation, per-location permission composition, and the snapshot compatibility-policy changes are implemented on the feature branch.
Alpha retention diagnostics and final feature documentation remain planned.

## Background

Removing permissions from a stored schema is unsafe when existing content may use them.
Applications can therefore accumulate unused fields and types that modern versions no longer need.
Rolling back application code must not remove the stored permissions or data introduced by a deployed version.

The first implementation addresses omitted optional object fields.
The composition extension applies the same preservation principle to allowed types and staged optionality.

## Summary

Construct an upgrade by composing the document's existing stored schema with the additions requested by the view.
Preserve existing permissions, then add the permissions selected by the view and its staging policy.
Apply the result only when it passes the existing upgrade rules and allows the requesting view to read and edit the document.

For optional object fields, this lets applications omit fields when the view enables `allowUnknownOptionalFields`.
Existing documents keep those fields and their data, while the view treats them as unknown optional fields.
The composition extension also preserves already-allowed types and already-enabled staged optionality without requiring a policy opt-in.

This supports application rollbacks and later compatible upgrades without deleting document data.

## The original problem

SharedTree uses two schemas:

- The **view schema** is declared in application code. It determines the fields that the application can access.
- The **stored schema** is saved with each document. It describes the data that the document can contain.

Originally, `allowUnknownOptionalFields` let a view read and edit documents with additional optional fields, but a view-only upgrade target omitted those fields.
The upgrade safety check correctly rejected that target.
The implemented field-preservation work resolves this case.

A similar gap existed for staged permissions.
For example, a stored field permits `number | string`, while the view declares `number | staged(string)`.
The default restrictive policy previously produced a candidate that allowed only `number`, so upgrading was rejected even though retaining `string` would make it a safe no-op.
The document was not narrowed: the unsafe candidate was rejected before it was applied.
Composition changes candidate construction, not the underlying safety rules.

## Optional-field behavior

The current view must allow unknown optional fields on the object from which you remove a field.
This is now the default for object schemas on `main`; applications can disable it with `allowUnknownOptionalFields: false`.
The field-preserving upgrade implementation uses this resolved setting.

| Action | Expected result |
| --- | --- |
| Open an existing document after removing an optional field from the view | The application can use the document. The removed field is not exposed through the view. |
| Upgrade that document after only removing the field | No stored-schema change is needed. The stored field and its data remain. |
| Make another compatible schema change later | The upgrade preserves the unknown field while applying the new change. |
| Initialize a new document with the reduced view schema | The new document does not include the removed field in its stored schema. |
| Restore a compatible declaration for the field | The application can access any retained field data again. |

These results assume there are no other incompatible schema changes.
Keep the object schema's identifier and the stored keys of its remaining fields unchanged.

**Removing a field from application code is not the same as deleting its data.**
The stored schema in an existing document continues to include the field and the types needed to interpret it.

## Example: Remove an experimental feature

Suppose your application has a `Task` object with a required `title` and an optional `experimentalNotes` field.
The object enables `allowUnknownOptionalFields`.

You decide to remove the notes feature:

1. Remove `experimentalNotes` from the view schema and remove the code that uses it.
2. Keep `allowUnknownOptionalFields` enabled on `Task`.
3. Open an existing document. You can still read and edit task titles, but the view does not expose the notes.
4. Later, add another optional field, such as `label`, and upgrade the document. The old notes remain stored.
5. If you restore a compatible notes feature (i.e. add a new field with the same name and compatible type(s)), it can read the retained notes.

The same approach supports a rollback to application code that does not declare the experimental field.
That code must still enable the object option and use a `tree` version that supports this capability.

## Composition of allowed types and staged changes

Staging controls whether new permissions are introduced, not whether existing permissions survive.
At each field location, preserve the stored allowed types and add types selected by the view's policy.
Likewise, an already-optional stored field remains optional when the view supports that through an optional or staged-optional declaration.
The view must still support the composed result; retaining a type does not make an otherwise unsupported type readable.

For example, an existing `Task.priority` allows `number | string`.
A view declares `number | staged(string)` and does not enable new string permissions.
An upgrade keeps `number | string` and is a no-op if there are no other changes.
A fresh document created with that same view and restrictive policy still allows only `number`.

Preservation applies separately at each location, not to an upgrade token as a whole.
If `Task.primaryPriority` already allows strings but `Task.fallbackPriority` does not, sharing a staged token must not enable strings in `fallbackPriority` merely to preserve them in `primaryPriority`.
Only an explicit policy decision may introduce that additional permission.

The alpha `includeAlreadyEnabledUpgrades` flag is removed.
Preserving already-enabled permissions is unconditional, but this is not equivalent to enabling a partially enabled token everywhere.

`canUpgrade` means that composition produces a safe stored-schema target that the requesting view can read and edit.
It does not mean that the stored schema can be replaced with a copy of the view schema.
All participating views must tolerate the permissions accumulated through composition; preservation alone does not grant support for unknown types.

## Compatibility in both directions

The object option supports both:

- **Forwards compatibility:** An older view tolerates optional fields added by a newer application version.
- **Backwards compatibility:** A view that removes optional fields tolerates older documents that still contain them and can make later compatible upgrades.

An unknown optional field can therefore come from either a newer schema or an older schema.

### Existing documents and new documents are different

An existing document retains the removed field's stored schema.
A new document created with the reduced view does not.

A client that still declares the field cannot immediately use that new document under the current viewing rules.
It may be able to upgrade the document to add the field schema again.
The field being optional does not remove this requirement.

Thus, field removal does not guarantee that all deployed application versions can immediately collaborate on all documents.
Keep schema compatibility tests for the versions you support.
The snapshot tool accepts direct viewing or a safe upgrade in both directions.
The current client must support documents from every historical snapshot.
Historical clients within the configured collaboration window must also support documents created with the current schema.
For each required direction, clients that can already view remain supported even when they cannot upgrade; clients that can do neither are rejected.
Applications must perform any required upgrade before viewing; a successful snapshot check does not make that upgrade unnecessary.

## Limits and data safety

- Omitted object-field preservation applies only to optional fields on view objects that enable `allowUnknownOptionalFields`.
- Allowed-type preservation must leave the composed target compatible with the requesting view, including its declared staged types.
- Removing required fields remains unsupported.
- Removing stored allowed types, dropping a type from the view without a supported way to tolerate it, or reusing a stored identifier with an incompatible definition remains unsupported.
- Staged optionality does not let a strictly required view field tolerate missing content.
- The feature does not delete historical data, reduce document storage, or provide a general schema downgrade.
- Preservation during schema upgrades does not make every application edit lossless.
  Reconstructing a node from only its visible properties can still omit unknown fields.

Existing tools that preserve unknown fields, such as whole-node moves and `TreeBeta.clone`, retain their role.

## Open Questions

### Optional field removal + schema versioning

Under the above proposal, an older client reading a newer document whose schema does not contain (removed) optional fields would need to perform a schema upgrade in order to view the newer document.
So long as this upgrade is strictly additive (i.e. doesn't remove features enabled in the document that are unknown by the older client's view schema), then such an "upgrade" should be compatible with newer clients collaborating on the document.

But having an older client "upgrade" a newer document seems odd.
Additionally, it isn't immediately clear how this would interact with our plans for explicit, persisted schema versioning.
