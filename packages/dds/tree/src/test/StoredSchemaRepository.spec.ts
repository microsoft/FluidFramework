/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

import { strict as assert } from "assert";

// TODO: what is the pattern for testing packages which have folders inside src?

import {
	FieldSchema,
	GlobalFieldKey, Multiplicity, TreeSchema, TreeSchemaIdentifier, ValueSchema,
} from "../schema/Schema";
import { string } from "../schema/examples/SchemaExamples";
import { StoredSchemaRepository } from "../schema/StoredSchemaRepository";
import { treeSchema, fieldSchema, emptyField, rootFieldKey } from "../schema/Builders";
import { Adapters, checkCompatibility, Compatibility } from "../schema/View";

class ViewSchemaRepository extends StoredSchemaRepository {
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

	const canvas = treeSchema({ localFields: { items: fieldSchema(Multiplicity.Sequence, [numberIdentifier]) } });
	const number = treeSchema({ value: ValueSchema.Number });

	const point = treeSchema({
		localFields: {
			x: fieldSchema(Multiplicity.Value, [numberIdentifier]),
			y: fieldSchema(Multiplicity.Value, [numberIdentifier]),
		},
	});

	// A type that can be used to position items without an inherent position within the canvas.
	const positionedCanvasItem = treeSchema({
		localFields: {
			position: fieldSchema(Multiplicity.Value, [pointIdentifier]),
			content: fieldSchema(Multiplicity.Value, [textIdentifier]),
		},
	});

	const root = fieldSchema(Multiplicity.Value, [canvasIdentifier]);

	/**
	 * This shows basic usage of stored and view schema, including a schema change handled using the
	 * "Design-pattern apps can use to handle schema migrations" proposed in `Stored and View Schema.md`.
	 * Note that this focuses on simpler compatible cases (where old data meets the new schema),
	 * and does only briefly mentions the case where adapters are needed (since they are not implemented yet).
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

		// This is where legacy schema handling logic for schematize.
		const adapters = new Adapters();

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

			// And since the document schema currently excludes empty roots, its also incompatible for writing:
			assert(compat.write === Compatibility.Incompatible);

			// Additionally even updating the document schema can't save this app,
			// since the new schema would be incompatible with the existing document content.
			assert(compat.writeAllowingStoredSchemaUpdates === Compatibility.Incompatible);

			// This is where the app would inform the user that the document
			// is not compatible with their version of the application.
		}

		// Since we currently don't have the APIs needed to add an adapter to handle empty documents
		// (ex: by providing a default empty canvas)
		// lets fix this by adjusting our view schema.
		// Lets simulate the developers of the app making this change by modifying the view schema
		// (instead of reloading it all).
		const tolerantRoot = fieldSchema(Multiplicity.Optional, [canvasIdentifier]);
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
					count: fieldSchema(Multiplicity.Value, [numberIdentifier]),
				},
			});
			// Lets allow counters inside positionedCanvasItem, instead of just text:
			const positionedCanvasItem2 = treeSchema({
				localFields: {
					position: fieldSchema(Multiplicity.Value, [pointIdentifier]),
					content: fieldSchema(Multiplicity.Value, [textIdentifier, counterIdentifier]),
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
});
