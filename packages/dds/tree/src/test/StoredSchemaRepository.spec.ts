/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

import { strict as assert } from "assert";

// TODO: what is the pattern for testing packages which have folders inside src?

import {
	FieldSchema,
	GlobalFieldKey, FieldKind, TreeSchema, TreeSchemaIdentifier, ValueSchema,
} from "../schema/Schema";
import { codePoint, string } from "../schema/examples/SchemaExamples";
import { StoredSchemaRepository } from "../schema/StoredSchemaRepository";
import { treeSchema, fieldSchema, emptyField, rootFieldKey } from "../schema/Builders";
import {
	Adapters, adaptRepo, checkCompatibility, Compatibility, MissingFieldAdapter, TreeAdapter,
} from "../schema/View";
import { isNeverField, isNeverTree } from "../schema/Comparison";

class ViewSchemaRepository extends StoredSchemaRepository {
	public clone(): ViewSchemaRepository {
		return new ViewSchemaRepository(new Map(this.fields), new Map(this.trees));
	}

	public overwriteFieldSchema(
		identifier: GlobalFieldKey,
		schema: FieldSchema,
	): void {
		this.fields.set(identifier, schema);
	}

	public overwriteTreeSchema(
		identifier: TreeSchemaIdentifier,
		schema: TreeSchema,
	): void {
		this.trees.set(identifier, schema);
	}
}

describe("StoredSchemaRepository", () => {
	// Define some schema and identifiers for them for use in these examples:
	const canvasIdentifier = "86432448-8454-4c86-a39c-699afbbdb753" as TreeSchemaIdentifier;
	const textIdentifier = "3034e643-0ff3-44a9-8b7e-aea31fe635c8" as TreeSchemaIdentifier;
	const positionedCanvasItemIdentifier = "d1810094-0990-410e-9704-b17a94b1ad85" as TreeSchemaIdentifier;
	const pointIdentifier = "a68c1750-9fba-4b6e-8643-9d830e271c05" as TreeSchemaIdentifier;
	const numberIdentifier = "08b4087a-da53-45d1-86cd-15a2948077bf" as TreeSchemaIdentifier;

	const canvas = treeSchema({ localFields: { items: fieldSchema(FieldKind.Sequence, [numberIdentifier]) } });
	const number = treeSchema({ value: ValueSchema.Number });

	const point = treeSchema({
		localFields: {
			x: fieldSchema(FieldKind.Value, [numberIdentifier]),
			y: fieldSchema(FieldKind.Value, [numberIdentifier]),
		},
	});

	// A type that can be used to position items without an inherent position within the canvas.
	const positionedCanvasItem = treeSchema({
		localFields: {
			position: fieldSchema(FieldKind.Value, [pointIdentifier]),
			content: fieldSchema(FieldKind.Value, [textIdentifier]),
		},
	});

	const root = fieldSchema(FieldKind.Value, [canvasIdentifier]);

	/**
	 * This shows basic usage of stored and view schema, including a schema change handled using the
	 * "Design-pattern apps can use to handle schema migrations" proposed in `Stored and View Schema.md`.
	 * Note that this focuses on simpler compatible cases
	 * (where old data meets the new schema and the schema is updated keeping the same identifier),
	 * and does only briefly mentions the case where a new identifier is needed
	 * (since adapters are not implemented yet, and they are the nice way to handle that).
	 */
	it("basic usage", () => {
		// Build a schema repository.
		// This will represent our view schema for a simple canvas application.
		const view = new ViewSchemaRepository();

		// Add schema to view repository, asserting adding is successful.
		// Since everything implicitly starts at a never schema, the order does not matter
		// (unless adding two versions with the same identifier).
		assert(view.tryUpdateTreeSchema(canvasIdentifier, canvas));
		assert(view.tryUpdateTreeSchema(numberIdentifier, number));
		assert(view.tryUpdateTreeSchema(pointIdentifier, point));
		assert(view.tryUpdateTreeSchema(positionedCanvasItemIdentifier, positionedCanvasItem));
		assert(view.tryUpdateTreeSchema(textIdentifier, string));
		assert(view.tryUpdateFieldSchema(rootFieldKey, root));

		// Check schema is actually valid. If we forgot to add some required types this would fail.
		assert(!isNeverField(view, root));
		assert(!isNeverTree(view, canvas));

		// This is where legacy schema handling logic for schematize.
		const adapters: Adapters = {};

		// Now lets imagine using this application on a new empty document.
		// StoredSchemaRepository defaults to a state that permits no document states at all.
		// To permit an empty document, we have to define a root field, and permit it to be empty.
		const stored = new StoredSchemaRepository();
		assert(stored.tryUpdateFieldSchema(rootFieldKey, emptyField));

		{
			// When we open this document, we should check it's compatibility with our application:
			const compat = checkCompatibility(stored, view, adapters);

			// Sadly for our application, we did not allow empty roots in our view schema,
			// nor did we provide an adapter capable of handling empty roots.
			// This means our application is unable to view this document.
			assert(compat.read === Compatibility.Incompatible);

			// And since the view schema currently excludes empty roots, its also incompatible for writing:
			assert(compat.write === Compatibility.Incompatible);

			// Additionally even updating the document schema can't save this app,
			// since the new schema would be incompatible with the existing document content.
			assert(compat.writeAllowingStoredSchemaUpdates === Compatibility.Incompatible);

			// This is where the app would inform the user that the document
			// is not compatible with their version of the application.
			// This situation (view schema expecting a value where stored schema does not have one),
			// applies just the same in non-root cases, and thus the resolutions apply would also apply to other cases.
		}

		// There are two ways the app could add support for handling empty documents.
		// 1. By adjusting it's view schema for the root field to tolerate empty (by making it optional).
		// 2. By providing a MissingFieldAdapter adapter for the root field (ex: by providing a default empty canvas).

		// This example picks the first approach.
		// Lets simulate the developers of the app making this change by modifying the view schema
		// (instead of reloading it all).
		const tolerantRoot = fieldSchema(FieldKind.Optional, [canvasIdentifier]);
		view.overwriteFieldSchema(rootFieldKey, tolerantRoot);

		{
			// When we open this document, we should check it's compatibility with our application:
			const compat = checkCompatibility(stored, view, adapters);

			// The adjusted view schema can be used read this document, no adapters needed.
			assert(compat.read === Compatibility.Compatible);

			// However the document just has its empty root schema,
			// so the app could make changes that could not be written back.
			assert(compat.write === Compatibility.Incompatible);

			// However, it is possible to update the schema in the document to match our schema
			// (since the existing data in compatible with our schema)
			assert(compat.writeAllowingStoredSchemaUpdates === Compatibility.Compatible);

			// The app can consider this compatible and proceed if it is ok with updating schema on write.
			// There are a few approaches apps might want to take here, but we will assume one that seems reasonable:
			// If this were a document that that the app just created,
			// it can imminently write its schema into the document:
			// it knows there are no existing users of this document that will be broken by this.
			// But if this is a document that it did not just create,
			// it could inform the user that this document is supported for import,
			// but its format may be updated when saving,
			// and let the user choose if they want to open it readonly on read-write.
			// A web application might want to have a table of well know format updates that it considers ok to do
			// implicitly to avoid prompting the user if the change is a well understood forward version migration
			// to a widely supported version.

			// Lets assume its time to update the schema in the document
			// (either eagerly or lazily when first needing to do so when writing into the document).
			// Once again the order does not matter:
			assert(stored.tryUpdateTreeSchema(canvasIdentifier, canvas));
			assert(stored.tryUpdateTreeSchema(numberIdentifier, number));
			assert(stored.tryUpdateTreeSchema(pointIdentifier, point));
			assert(stored.tryUpdateTreeSchema(positionedCanvasItemIdentifier, positionedCanvasItem));
			assert(stored.tryUpdateTreeSchema(textIdentifier, string));
			assert(stored.tryUpdateFieldSchema(rootFieldKey, tolerantRoot));

			// That will cause the document stored schema to change,
			// which will notify and applications with the document open.
			// They can recheck their compatibility:
			const compatNew = checkCompatibility(stored, view, adapters);
			assert(compatNew.read === Compatibility.Compatible);
			// It is now possible to write our date into the document.
			assert(compatNew.write === Compatibility.Compatible);

			// Now lets imagine some time passes, and the developers want to add a second content type:
			const counterIdentifier = "0d8da0ca-b3ba-4025-93a3-b8f181379e3b" as TreeSchemaIdentifier;
			const counter = treeSchema({
				localFields: {
					count: fieldSchema(FieldKind.Value, [numberIdentifier]),
				},
			});
			// Lets allow counters inside positionedCanvasItem, instead of just text:
			const positionedCanvasItem2 = treeSchema({
				localFields: {
					position: fieldSchema(FieldKind.Value, [pointIdentifier]),
					content: fieldSchema(FieldKind.Value, [textIdentifier, counterIdentifier]),
				},
			});
			// Once again we will simulate reloading the app with different schema by modifying the view schema.
			assert(view.tryUpdateTreeSchema(counterIdentifier, counter));
			assert(view.tryUpdateTreeSchema(positionedCanvasItemIdentifier, positionedCanvasItem2));

			// With this new schema, we can load the document just like before:
			const compat2 = checkCompatibility(stored, view, adapters);
			assert(compat2.read === Compatibility.Compatible);
			assert(compat2.write === Compatibility.Incompatible);
			assert(compat2.writeAllowingStoredSchemaUpdates === Compatibility.Compatible);

			// This is the same case as above where we can choose to do a schema update if we want:
			assert(stored.tryUpdateTreeSchema(positionedCanvasItemIdentifier, positionedCanvasItem2));
			assert(stored.tryUpdateTreeSchema(counterIdentifier, counter));

			// And recheck compat:
			const compat3 = checkCompatibility(stored, view, adapters);
			assert(compat3.read === Compatibility.Compatible);
			assert(compat3.write === Compatibility.Compatible);
		}
	});

	/**
	 * This shows basic usage of stored and view schema including adapters.
	 */
	it("adapters", () => {
		// Build a schema repository.
		// This will represent our view schema for a simple canvas application,
		// same as the above example, but after some schema changes.
		const view = new ViewSchemaRepository();

		// Add schema to view repository, asserting adding is successful.
		// Since everything implicitly starts at a never schema, the order does not matter
		// (unless adding two versions with the same identifier).
		assert(view.tryUpdateTreeSchema(canvasIdentifier, canvas));
		assert(view.tryUpdateTreeSchema(numberIdentifier, number));
		assert(view.tryUpdateTreeSchema(pointIdentifier, point));
		assert(view.tryUpdateTreeSchema(positionedCanvasItemIdentifier, positionedCanvasItem));
		assert(view.tryUpdateTreeSchema(textIdentifier, string));
		assert(view.tryUpdateFieldSchema(rootFieldKey, root));

		// Register an adapter that handles a missing root.
		// Currently we are just declaring that such a handler exits:
		// the API for saying what to do in this case are not done.
		const adapters: Adapters = { missingField: new Map([[rootFieldKey, { field: rootFieldKey }]]) };

		// Like the "basic" example, start with an empty document:
		const stored = new StoredSchemaRepository();
		assert(stored.tryUpdateFieldSchema(rootFieldKey, emptyField));

		// Open document, and check it's compatibility with our application:
		const compat = checkCompatibility(stored, view, adapters);

		// As long as we are willing to use adapters, the application should be able to read this document.
		assert(compat.read === Compatibility.RequiresAdapters);

		// And since the document schema currently excludes empty roots, its also incompatible for writing:
		assert(compat.write === Compatibility.Incompatible);

		// Additionally even updating the document schema can't save this app,
		// since the new schema would be incompatible with the existing document content.
		assert(compat.writeAllowingStoredSchemaUpdates === Compatibility.RequiresAdapters);

		// Like with the basic example,
		// the app makes a choice here about its policy for if and when to update stored schema.
		// Lets assume eventually it updates the schema, either eagerly or lazily.
		// It will be updated to:
		const adaptedSchema = adaptRepo(view, adapters);
		for (const [key, schema] of adaptedSchema.globalFieldSchema) {
			assert(stored.tryUpdateFieldSchema(key, schema));
		}
		for (const [key, schema] of adaptedSchema.treeSchema) {
			assert(stored.tryUpdateTreeSchema(key, schema));
		}

		// That will cause the document stored schema to change,
		// which will notify and applications with the document open.
		// They can recheck their compatibility:
		const compatNew = checkCompatibility(stored, view, adapters);
		assert(compatNew.read === Compatibility.RequiresAdapters);
		// It is now possible to write our date into the document.
		assert(compatNew.write === Compatibility.Compatible);
	});

	/**
	 * Shows a schema update involving both cases:
	 * 1. a type that gets a new identifier since its new format is not compatible with the old one.
	 * 2. a type which is updated in place (same identifier)
	 *
	 * An adapter is used to allow the view schema (and thus application logic)
	 * to not refer to the old types, and instead factor legacy schema handling into a library of adapters.
	 */
	it("schema updating using adapters", () => {
		const view = new ViewSchemaRepository();

		// In this version of the app,
		// we decided that text should be organized into a hierarchy of formatting ranges.
		// We are doing this schema change in an incompatible way, and thus introducing a new identifier:
		const formattedTextIdentifier = "2cbc277e-8820-41ef-a3f4-0a00de8ef934" as TreeSchemaIdentifier;
		const formattedText = treeSchema({
			localFields: {
				content: fieldSchema(FieldKind.Sequence, [formattedTextIdentifier, codePoint.name]),
				size: fieldSchema(FieldKind.Value, [numberIdentifier]),
			},
		});

		// We are also updating positionedCanvasItem to accept the new type.
		// It would also be possible to make this accept both types, and do this example without adapters,
		// but for this example we assume the application does not want to deal with the old text format,
		// so we will support it using adapters.
		// Were we not batching all these examples in one scope, this would reuse the `positionedCanvasItem` name
		// as no version of the app need both view schema at the same time
		// (except for some approaches for staging roll-outs which are not covered here).
		const positionedCanvasItemNew = treeSchema({
			localFields: {
				position: fieldSchema(FieldKind.Value, [pointIdentifier]),
				// Note that we are specifically excluding the old text here
				content: fieldSchema(FieldKind.Value, [formattedTextIdentifier]),
			},
		});

		assert(view.tryUpdateTreeSchema(canvasIdentifier, canvas));
		assert(view.tryUpdateTreeSchema(numberIdentifier, number));
		assert(view.tryUpdateTreeSchema(pointIdentifier, point));
		assert(view.tryUpdateTreeSchema(positionedCanvasItemIdentifier, positionedCanvasItemNew));
		assert(view.tryUpdateTreeSchema(formattedTextIdentifier, formattedText));
		assert(view.tryUpdateFieldSchema(rootFieldKey, root));

		// To support old documents with the old text schema, we can add a compatibility library that adds:
		assert(view.tryUpdateTreeSchema(textIdentifier, string));
		const textAdapter: TreeAdapter = { input: textIdentifier, output: formattedTextIdentifier };

		// Include adapters for all compatibility cases: empty root and old text.
		const rootAdapter: MissingFieldAdapter = { field: rootFieldKey };
		const adapters: Adapters = { missingField: new Map([[rootFieldKey, rootAdapter]]), tree: [textAdapter] };

		// Check this works for empty documents:
		{
			const stored = new StoredSchemaRepository();
			assert(stored.tryUpdateFieldSchema(rootFieldKey, emptyField));
			const compat = checkCompatibility(stored, view, adapters);
			assert(compat.read === Compatibility.RequiresAdapters);
			assert(compat.writeAllowingStoredSchemaUpdates === Compatibility.RequiresAdapters);
		}

		// Check this works for documents with old text
		{
			const stored = new StoredSchemaRepository();
			// This is the root type produced by the adapter for the root.
			const tolerantRoot = fieldSchema(FieldKind.Optional, [canvasIdentifier]);
			assert(stored.tryUpdateTreeSchema(canvasIdentifier, canvas));
			assert(stored.tryUpdateTreeSchema(numberIdentifier, number));
			assert(stored.tryUpdateTreeSchema(pointIdentifier, point));
			assert(stored.tryUpdateTreeSchema(positionedCanvasItemIdentifier, positionedCanvasItem));
			assert(stored.tryUpdateTreeSchema(textIdentifier, string));
			assert(stored.tryUpdateFieldSchema(rootFieldKey, tolerantRoot));

			const compat = checkCompatibility(stored, view, adapters);
			assert(compat.read === Compatibility.RequiresAdapters);
			assert(compat.writeAllowingStoredSchemaUpdates === Compatibility.RequiresAdapters);

			// Note that if/when we update the stored schema for these changes,
			// the adapters are still required, since that will just permit the new types,
			// and not exclude the old ones,
			// since it would be updating to the adapted schema (not the view schema):
			const adaptedSchema = adaptRepo(view, adapters);
			for (const [key, schema] of adaptedSchema.globalFieldSchema) {
				assert(stored.tryUpdateFieldSchema(key, schema));
			}
			for (const [key, schema] of adaptedSchema.treeSchema) {
				assert(stored.tryUpdateTreeSchema(key, schema));
			}

			const compatNew = checkCompatibility(stored, view, adapters);
			assert(compatNew.read === Compatibility.RequiresAdapters);
			assert(compatNew.write === Compatibility.Compatible);
		}
	});
});
