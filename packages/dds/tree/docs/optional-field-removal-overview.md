# Proposal: Remove optional fields from SharedTree application schemas

**Status:** Proposed behavior. This capability is not implemented.

## Background

It is not currently possible with SharedTree to remove fields or types from schema.
We refer to this concept as "narrowing" the schema.
This means that in-development applications will, over time, accrue unused fields and types in their schema that are not referenced by modern versions of the application.
Additionally, regarding for fields of object schema in particular, it is currently impossible to "roll back" unwanted additions to schema that have ever been shipped to customers.

The following proposal is aimed at addressing these concerns for *optional fields* specifically.

## Summary

Let applications remove optional fields from object schemas that enable `allowUnknownOptionalFields`.
Existing documents would keep the removed fields and their data.
Future versions of the application would treat them as unknown optional fields and could still make later compatible schema upgrades.

This would make it easier to roll back application changes or remove experimental features without deleting document data.

## The problem today

SharedTree uses two schemas:

- The **view schema** is declared in application code. It determines the fields that the application can access.
- The **stored schema** is saved with each document. It describes the data that the document can contain.

Today, `allowUnknownOptionalFields` lets a view read and edit a document that has additional optional fields.
However, those unknown fields prevent the application from upgrading the document's schema.

For example, you can stop declaring an experimental field and still open existing documents.
But the removed field prevents you from making a later schema upgrade, even if the new change is otherwise compatible.

## Proposed behavior

The current view must allow unknown optional fields on the object from which you remove a field.
This is now the default for object schemas on `main`; applications can disable it with `allowUnknownOptionalFields: false`.
The default change does not itself implement the field-preserving upgrades proposed here.

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

## Compatibility in both directions

The option would support both:

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
Those tests must continue to detect the new-document limitation.

## Limits and data safety

- The feature applies only to optional fields on view objects that enable `allowUnknownOptionalFields`.
- Removing required fields remains unsupported.
- Narrowing allowed types or reusing a stored field key with an incompatible definition remains unsupported.
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
