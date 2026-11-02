# Proposal: Remove optional fields from SharedTree application schemas

**Status:** Proposed behavior. This capability is not implemented.

## Summary

Let applications remove optional fields from object schemas that enable `allowUnknownOptionalFields`.
Existing documents would keep the removed fields and their data.
The application would treat them as unknown optional fields and could still make later compatible schema upgrades.

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

The current view must enable `allowUnknownOptionalFields` on the object from which you remove a field.
No new option is proposed.

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
5. If you restore a compatible notes feature, it can read the retained notes.

The same approach supports a rollback to application code that does not declare the experimental field.
That code must still enable the object option and use a `tree` version that supports this capability.

## Compatibility in both directions

The option would support both:

- **Forwards compatibility:** An older view tolerates optional fields added by a newer application version.
- **Backwards compatibility:** A view that removes optional fields tolerates older documents that still contain them and can make later compatible upgrades.

An unknown optional field can therefore come from either a newer schema or an older schema.
The option is not a general permission to ignore incompatible changes.

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
- Preservation during schema upgrades does not make every application edit lossless. Reconstructing a node from only its visible properties can still omit unknown fields.
- Previously deployed `tree` versions do not gain this behavior automatically.

Existing tools that preserve unknown fields, such as whole-node moves and `TreeBeta.clone`, retain their role.
Removing a feature is not a data-erasure mechanism.

## Delivery expectations

Before release, verify that removed fields survive later upgrades, collaboration, and document reloads.
Also verify that restoring a compatible field exposes the retained data and that incompatible changes are rejected.

Update the documentation for `allowUnknownOptionalFields` and the website's schema-evolution guide.
Both should explain the two compatibility directions, a rollback example, and the difference between existing and new documents.

## Related documentation

These links describe the existing behavior at the source revision used for this proposal.
They do not indicate that the proposed capability is available.

- [Object schema options and unknown-field data handling](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/schemaFactoryOptions.ts#L14).
- [Schema compatibility status](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/packages/dds/tree/src/simple-tree/api/tree.ts#L1115).
- [Website schema-evolution guide](https://github.com/microsoft/FluidFramework/blob/7a49a6eea054b594a0c0dba7a8abd2e6bef35cd7/website/docs/data-structures/tree/schema-evolution/index.mdx).
