/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	TreeFieldSchema,
	FullSchemaPolicy,
	ViewSchema,
	FieldKinds,
	defaultSchemaPolicy,
	FlexTreeSchema,
} from "../../../feature-libraries";
import {
	TreeFieldStoredSchema,
	TreeNodeStoredSchema,
	TreeNodeSchemaIdentifier,
	InMemoryStoredSchemaRepository,
	Adapters,
	Compatibility,
	storedEmptyFieldSchema,
	TreeStoredSchema,
} from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import { allowsFieldSuperset, allowsTreeSuperset } from "../../../feature-libraries/modular-schema";
import { SchemaBuilder, leaf } from "../../../domains";

class TestSchemaRepository extends InMemoryStoredSchemaRepository {
	public constructor(
		public readonly policy: FullSchemaPolicy,
		data?: TreeStoredSchema,
	) {
		super(data);
	}

	/**
	 * Updates the specified schema iff all possible in schema data would remain in schema after the change.
	 * @returns true iff update was performed.
	 */
	public tryUpdateRootFieldSchema(schema: TreeFieldStoredSchema): boolean {
		if (allowsFieldSuperset(this.policy, this, this.rootFieldSchema, schema)) {
			this.rootFieldSchemaData = schema;
			this.events.emit("afterSchemaChange", this);
			return true;
		}
		return false;
	}
	/**
	 * Updates the specified schema iff all possible in schema data would remain in schema after the change.
	 * @returns true iff update was performed.
	 */
	public tryUpdateTreeSchema(
		identifier: TreeNodeSchemaIdentifier,
		schema: TreeNodeStoredSchema,
	): boolean {
		const original = this.nodeSchema.get(identifier);
		if (allowsTreeSuperset(this.policy, this, original, schema)) {
			this.nodeSchemaData.set(identifier, schema);
			this.events.emit("afterSchemaChange", this);
			return true;
		}
		return false;
	}
}

function assertEnumEqual<TEnum extends { [key: number]: string }>(
	enumObject: TEnum,
	a: number,
	b: number,
): void {
	if (a !== b) {
		assert.fail(`expected ${a} (${enumObject[a]}) to equal ${b} (${enumObject[b]})`);
	}
}

describe("Schema Evolution Examples", () => {
	const contentTypesBuilder = new SchemaBuilder({
		scope: "test",
		name: "Schema Evolution Examples: default content types",
	});

	const codePoint = contentTypesBuilder.fieldNode("Primitive.CodePoint", leaf.number);

	// String made of unicode code points, allowing for sequence editing of a string.
	const text = contentTypesBuilder.object("Text", {
		children: TreeFieldSchema.create(FieldKinds.sequence, [codePoint]),
	});

	const point = contentTypesBuilder.object("Point", {
		x: leaf.number,
		y: leaf.number,
	});

	const defaultContentLibrary = contentTypesBuilder.intoLibrary();

	const containersBuilder = new SchemaBuilder({
		scope: "test",
		name: "Schema Evolution Examples: default containers",
		libraries: [defaultContentLibrary],
	});

	// A type that can be used to position items without an inherent position within the canvas.
	const positionedCanvasItem = containersBuilder.object("PositionedCanvasItem", {
		position: point,
		content: text,
	});
	const canvas = containersBuilder.object("Canvas", {
		items: TreeFieldSchema.create(FieldKinds.sequence, [positionedCanvasItem]),
	});

	const root: TreeFieldSchema = TreeFieldSchema.create(FieldKinds.required, [canvas]);

	const tolerantRoot = TreeFieldSchema.create(FieldKinds.optional, [canvas]);

	const treeViewSchema = containersBuilder.intoLibrary();

	/**
	 * This shows basic usage of stored and view schema, including a schema change handled using the
	 * "Design-pattern apps can use to handle schema migrations" proposed in `Stored and View Schema.md`.
	 * Note that this focuses on simpler compatible cases
	 * (where old data meets the new schema and the schema is updated keeping the same identifier),
	 * and does only briefly mentions the case where a new identifier is needed
	 * (since adapters are not implemented yet, and they are the nice way to handle that).
	 */
	it("basic usage", () => {
		// Collect our view schema.
		// This will represent our view schema for a simple canvas application.
		const viewCollection: FlexTreeSchema = new SchemaBuilder({
			scope: "test",
			name: "basic usage",
			libraries: [treeViewSchema],
		}).intoSchema(root);

		// This is where legacy schema handling logic for schematize.
		const adapters: Adapters = {};
		// Compose all the view information together.
		const view = new ViewSchema(defaultSchemaPolicy, adapters, viewCollection);

		// Now lets imagine using this application on a new empty document.
		// StoredSchemaRepository defaults to a state that permits no document states at all.
		// To permit an empty document, we have to define a root field, and permit it to be empty.
		const stored = new TestSchemaRepository(defaultSchemaPolicy);
		assert(stored.tryUpdateRootFieldSchema(storedEmptyFieldSchema));

		{
			// When we open this document, we should check it's compatibility with our application:
			const compat = view.checkCompatibility(stored);

			// Sadly for our application, we did not allow empty roots in our view schema,
			// nor did we provide an adapter capable of handling empty roots.
			// This means our application is unable to view this document.
			assertEnumEqual(Compatibility, compat.read, Compatibility.Incompatible);

			// And since the view schema currently excludes empty roots, its also incompatible for writing:
			assertEnumEqual(Compatibility, compat.write, Compatibility.Incompatible);

			// Additionally even updating the document schema can't save this app,
			// since the new schema would be incompatible with the existing document content.
			assertEnumEqual(
				Compatibility,
				compat.writeAllowingStoredSchemaUpdates,
				Compatibility.Incompatible,
			);

			// This is where the app would inform the user that the document
			// is not compatible with their version of the application.
			// This situation (view schema expecting a value where stored schema does not have one),
			// applies just the same in non-root cases, and thus the resolutions apply would also apply to other cases.
		}

		{
			// There are two ways the app could add support for handling empty documents.
			// 1. By adjusting it's view schema for the root field to tolerate empty (by making it optional).
			// 2. By providing a MissingFieldAdapter adapter for the root field
			//    (ex: by providing a default empty canvas).

			// This example picks the first approach.
			// Lets simulate the developers of the app making this change by modifying the view schema:
			const viewCollection2 = new SchemaBuilder({
				scope: "test",
				name: "basic usage2",
				libraries: [treeViewSchema],
			}).intoSchema(tolerantRoot);
			const view2 = new ViewSchema(defaultSchemaPolicy, adapters, viewCollection2);
			// When we open this document, we should check it's compatibility with our application:
			const compat = view2.checkCompatibility(stored);

			// The adjusted view schema can be used read this document, no adapters needed.
			assertEnumEqual(Compatibility, compat.read, Compatibility.Compatible);

			// However the document just has its empty root schema,
			// so the app could make changes that could not be written back.
			assertEnumEqual(Compatibility, compat.write, Compatibility.Incompatible);

			// However, it is possible to update the schema in the document to match our schema
			// (since the existing data in compatible with our schema)
			assertEnumEqual(
				Compatibility,
				compat.writeAllowingStoredSchemaUpdates,
				Compatibility.Compatible,
			);

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
			assert(stored.tryUpdateTreeSchema(canvas.name, canvas));
			assert(stored.tryUpdateTreeSchema(leaf.number.name, leaf.number.stored));
			assert(stored.tryUpdateTreeSchema(point.name, point));
			assert(stored.tryUpdateTreeSchema(positionedCanvasItem.name, positionedCanvasItem));
			assert(stored.tryUpdateTreeSchema(text.name, text));
			assert(stored.tryUpdateTreeSchema(codePoint.name, codePoint.stored));
			assert(stored.tryUpdateRootFieldSchema(tolerantRoot));
			assert(stored.tryUpdateTreeSchema(leaf.number.name, leaf.number.stored));
			assert(stored.tryUpdateTreeSchema(leaf.boolean.name, leaf.boolean.stored));
			assert(stored.tryUpdateTreeSchema(leaf.string.name, leaf.string.stored));
			assert(stored.tryUpdateTreeSchema(leaf.handle.name, leaf.handle.stored));
			assert(stored.tryUpdateTreeSchema(leaf.null.name, leaf.null.stored));

			// That will cause the document stored schema to change,
			// which will notify and applications with the document open.
			// They can recheck their compatibility:
			const compatNew = view2.checkCompatibility(stored);
			assertEnumEqual(Compatibility, compatNew.read, Compatibility.Compatible);
			// It is now possible to write our date into the document.
			assertEnumEqual(Compatibility, compatNew.write, Compatibility.Compatible);

			// Now lets imagine some time passes, and the developers want to add a second content type:
			const builderWithCounter = new SchemaBuilder({
				scope: "test",
				name: "builderWithCounter",
				libraries: [defaultContentLibrary],
			});

			const counter = builderWithCounter.object("Counter", {
				count: leaf.number,
			});
			// Lets allow counters inside positionedCanvasItem, instead of just text:
			const positionedCanvasItem2 = builderWithCounter.object("PositionedCanvasItem", {
				position: point,
				content: [text, counter],
			});
			// And canvas is still the same storage wise, but its view schema references the updated positionedCanvasItem2:
			const canvas2 = builderWithCounter.object("Canvas", {
				items: TreeFieldSchema.create(FieldKinds.sequence, [positionedCanvasItem2]),
			});
			// Once again we will simulate reloading the app with different schema by modifying the view schema.
			const viewCollection3: FlexTreeSchema = builderWithCounter.intoSchema(
				TreeFieldSchema.create(FieldKinds.optional, [canvas2]),
			);
			const view3 = new ViewSchema(defaultSchemaPolicy, adapters, viewCollection3);

			// With this new schema, we can load the document just like before:
			const compat2 = view3.checkCompatibility(stored);
			assertEnumEqual(Compatibility, compat2.read, Compatibility.Compatible);
			assertEnumEqual(Compatibility, compat2.write, Compatibility.Incompatible);
			assertEnumEqual(
				Compatibility,
				compat2.writeAllowingStoredSchemaUpdates,
				Compatibility.Compatible,
			);

			// This is the same case as above where we can choose to do a schema update if we want:
			assert(stored.tryUpdateTreeSchema(positionedCanvasItem.name, positionedCanvasItem2));
			assert(stored.tryUpdateTreeSchema(counter.name, counter));

			// And recheck compat:
			const compat3 = view3.checkCompatibility(stored);
			assertEnumEqual(Compatibility, compat3.read, Compatibility.Compatible);
			assertEnumEqual(Compatibility, compat3.write, Compatibility.Compatible);
		}
	});

	// TODO: support adapters

	// function makeTolerantRootAdapter(view: TreeStoredSchema): FieldAdapter {
	// 	return {
	// 		field: rootFieldKey,
	// 		convert: (field): TreeFieldStoredSchema => {
	// 			const allowed = allowsFieldSuperset(defaultSchemaPolicy, view, field, tolerantRoot);
	// 			const out: TreeFieldStoredSchema = allowed ? root : field;
	// 			return out;
	// 		},
	// 	};
	// }

	// /**
	//  * This shows basic usage of stored and view schema including adapters.
	//  */
	// it("adapters", () => {
	// 	// Build a schema repository.
	// 	// This will represent our view schema for a simple canvas application,
	// 	// same as the above example, but after some schema changes.
	// 	const viewCollection: SchemaCollection = {
	// 		rootFieldSchema: root,
	// 		treeSchema: treeViewSchema.treeSchema,
	// 		policy: defaultSchemaPolicy,
	// 		adapters: {},
	// 	};

	// 	// Register an adapter that handles a missing root.
	// 	// Currently we are just declaring that such a handler exits:
	// 	// the API for saying what to do in this case are not done.
	// 	const adapters: Adapters = {
	// 		fieldAdapters: new Map([[rootFieldKey, makeTolerantRootAdapter(viewCollection)]]),
	// 	};
	// 	// Compose all the view information together.
	// 	const view = new ViewSchema(defaultSchemaPolicy, adapters, viewCollection);

	// 	// Like the "basic" example, start with an empty document:
	// 	const stored = new TestSchemaRepository(defaultSchemaPolicy);
	// 	assert(stored.tryUpdateRootFieldSchema(emptyField));

	// 	// Open document, and check it's compatibility with our application:
	// 	const compat = view.checkCompatibility(stored);

	// 	// As long as we are willing to use adapters, the application should be able to read this document.
	// 	assertEnumEqual(Compatibility, compat.read, Compatibility.RequiresAdapters);

	// 	// And since the document schema currently excludes empty roots, its also incompatible for writing:
	// 	assertEnumEqual(Compatibility, compat.write, Compatibility.Incompatible);

	// 	// Additionally even updating the document schema can't avoid needing an adapter for the root,
	// 	// since the new schema would be incompatible with possible existing document content (empty documents).
	// 	assertEnumEqual(
	// 		Compatibility,
	// 		compat.writeAllowingStoredSchemaUpdates,
	// 		Compatibility.RequiresAdapters,
	// 	);

	// 	// Like with the basic example,
	// 	// the app makes a choice here about its policy for if and when to update stored schema.
	// 	// Lets assume eventually it updates the schema, either eagerly or lazily.

	// 	// We can update the root to be optional:
	// 	// TODO: add an automated way to determine that this is an upgrade that is needed and allowed.
	// 	stored.tryUpdateRootFieldSchema(tolerantRoot);
	// 	for (const [key, schema] of view.schema.treeSchema) {
	// 		// All the tree schema in the view should be compatible with the stored schema,
	// 		// so for this particular case we assert these all pass.
	// 		assert(stored.tryUpdateTreeSchema(key, schema));
	// 	}

	// 	// That will cause the document stored schema to change,
	// 	// which will notify and applications with the document open.
	// 	// They can recheck their compatibility:
	// 	const compatNew = view.checkCompatibility(stored);
	// 	// We still need the adapter to handle empty documents.
	// 	assertEnumEqual(Compatibility, compatNew.read, Compatibility.RequiresAdapters);
	// 	// It is now possible to write our data into the document, since we have updated its stored schema.
	// 	assertEnumEqual(Compatibility, compatNew.write, Compatibility.Compatible);
	// });

	// /**
	//  * Shows a schema update involving both cases:
	//  * 1. a type that gets a new identifier since its new format is not compatible with the old one.
	//  * 2. a type which is updated in place (same identifier)
	//  *
	//  * An adapter is used to allow the view schema (and thus application logic)
	//  * to not refer to the old types, and instead factor legacy schema handling into a library of adapters.
	//  */
	// it("schema updating using adapters", () => {
	// 	// In this version of the app,
	// 	// we decided that text should be organized into a hierarchy of formatting ranges.
	// 	// We are doing this schema change in an incompatible way, and thus introducing a new identifier:
	// 	const formattedTextIdentifier: TreeNodeSchemaIdentifier = brand(
	// 		"2cbc277e-8820-41ef-a3f4-0a00de8ef934",
	// 	);
	// 	const builder = new SchemaBuilder("adapters examples", defaultContentLibrary);
	// 	const formattedText = builder.objectRecursive(formattedTextIdentifier, {
	// 		content: TreeFieldSchema.createUnsafe(
	// 			FieldKinds.sequence,
	// 			() => formattedText,
	// 			codePoint,
	// 		),
	// 		size: (number),
	// 	});

	// 	// We are also updating positionedCanvasItem to accept the new type.
	// 	// It would also be possible to make this accept both types, and do this example without adapters,
	// 	// but for this example we assume the application does not want to deal with the old text format,
	// 	// so we will support it using adapters.
	// 	// Were we not batching all these examples in one scope, this would reuse the `positionedCanvasItem` name
	// 	// as no version of the app need both view schema at the same time
	// 	// (except for some approaches for staging roll-outs which are not covered here).
	// 	const positionedCanvasItemNew = builder.object(positionedCanvasItemIdentifier, {
	// 		position: (point),
	// 		// Note that we are specifically excluding the old text here
	// 		content: (formattedText),
	// 	});
	// 	// And canvas is still the same storage wise, but its view schema references the updated positionedCanvasItem2:
	// 	const canvas2 = builder.object(canvasIdentifier, {
	// 		items: TreeFieldSchema.create(FieldKinds.sequence, positionedCanvasItemNew),
	// 	});

	// 	const viewCollection: SchemaCollection = builder.intoSchema(
	// 		SchemaBuilder.required(canvas2),
	// 	);

	// 	const textAdapter: TreeAdapter = { input: textIdentifier, output: formattedTextIdentifier };

	// 	// Include adapters for all compatibility cases: empty root and old text.
	// 	const rootAdapter: FieldAdapter = makeTolerantRootAdapter(viewCollection);
	// 	const adapters: Adapters = {
	// 		fieldAdapters: new Map([[rootFieldKey, rootAdapter]]),
	// 		tree: [textAdapter],
	// 	};

	// 	const view = new ViewSchema(defaultSchemaPolicy, adapters, viewCollection);

	// 	// Check this works for empty documents:
	// 	{
	// 		const stored = new TestSchemaRepository(defaultSchemaPolicy);
	// 		assert(stored.tryUpdateRootFieldSchema(emptyField));
	// 		const compat = view.checkCompatibility(stored);
	// 		assert(compat.read === Compatibility.RequiresAdapters);
	// 		assert(compat.writeAllowingStoredSchemaUpdates === Compatibility.RequiresAdapters);
	// 	}

	// 	// Check this works for documents with old text
	// 	{
	// 		const stored = new TestSchemaRepository(defaultSchemaPolicy);
	// 		assert(stored.tryUpdateTreeSchema(canvasIdentifier, canvas));
	// 		assert(stored.tryUpdateTreeSchema(numberIdentifier, number));
	// 		assert(stored.tryUpdateTreeSchema(pointIdentifier, point));
	// 		assert(
	// 			stored.tryUpdateTreeSchema(positionedCanvasItemIdentifier, positionedCanvasItem),
	// 		);
	// 		assert(stored.tryUpdateTreeSchema(textIdentifier, text));
	// 		assert(stored.tryUpdateTreeSchema(codePoint.name, codePoint));
	// 		// This is the root type produced by the adapter for the root.
	// 		assert(stored.tryUpdateRootFieldSchema(tolerantRoot));

	// 		const compat = view.checkCompatibility(stored);
	// 		assertEnumEqual(Compatibility, compat.read, Compatibility.RequiresAdapters);
	// 		// Writing requires schema updates and/or adapters.
	// 		assertEnumEqual(
	// 			Compatibility,
	// 			compat.writeAllowingStoredSchemaUpdates,
	// 			Compatibility.RequiresAdapters,
	// 		);

	// 		// Note that if/when we update the stored schema for these changes,
	// 		// the adapters are still required, since that will just permit the new types,
	// 		// and don't exclude the old ones.
	// 		// TODO: add an automated way to determine that this is the needed upgrade (some way to union schema?).
	// 		const positionedCanvasItemTolerant = treeSchema({
	// 			objectNodeFields: {
	// 				position: fieldSchema(FieldKinds.required, [pointIdentifier]),
	// 				// Note that we are specifically supporting both formats here.
	// 				content: fieldSchema(FieldKinds.required, [
	// 					formattedTextIdentifier,
	// 					textIdentifier,
	// 				]),
	// 			},
	// 			mapFields: emptyField,
	// 		});
	// 		assert(
	// 			stored.tryUpdateTreeSchema(
	// 				positionedCanvasItemIdentifier,
	// 				positionedCanvasItemTolerant,
	// 			),
	// 		);
	// 		assert(stored.tryUpdateTreeSchema(formattedTextIdentifier, formattedText));

	// 		const compatNew = view.checkCompatibility(stored);
	// 		assertEnumEqual(Compatibility, compatNew.read, Compatibility.RequiresAdapters);
	// 		// Now writing is possible:
	// 		assertEnumEqual(Compatibility, compatNew.write, Compatibility.Compatible);
	// 	}
	// });
});
